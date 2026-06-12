import { createVerify } from 'node:crypto'

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

let certCache = { expiresAt: 0, certs: {} }

const allowedEmail = () => String(process.env.ALLOWED_EMAIL || 'fnaticdoc@gmail.com').toLowerCase()

const projectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

const decodeJson = (value) => JSON.parse(decodeBase64Url(value).toString('utf8'))

const getCerts = async () => {
  if (Date.now() < certCache.expiresAt && Object.keys(certCache.certs).length) return certCache.certs

  const response = await fetch(CERT_URL)
  if (!response.ok) throw Object.assign(new Error('Firebase 공개 인증서를 가져오지 못했습니다.'), { status: 503 })

  const cacheControl = response.headers.get('cache-control') || ''
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600)
  certCache = {
    certs: await response.json(),
    expiresAt: Date.now() + maxAge * 1000,
  }
  return certCache.certs
}

const verifyIdToken = async (idToken) => {
  const [encodedHeader, encodedPayload, encodedSignature] = String(idToken).split('.')
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw Object.assign(new Error('잘못된 토큰 형식입니다.'), { status: 401 })
  }

  const header = decodeJson(encodedHeader)
  const payload = decodeJson(encodedPayload)
  if (header.alg !== 'RS256' || !header.kid) {
    throw Object.assign(new Error('지원하지 않는 토큰 서명입니다.'), { status: 401 })
  }

  const certs = await getCerts()
  const cert = certs[header.kid]
  if (!cert) throw Object.assign(new Error('토큰 서명 키를 찾지 못했습니다.'), { status: 401 })

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${encodedHeader}.${encodedPayload}`)
  verifier.end()
  const signatureOk = verifier.verify(cert, decodeBase64Url(encodedSignature))
  if (!signatureOk) throw Object.assign(new Error('토큰 서명이 유효하지 않습니다.'), { status: 401 })

  const pid = projectId()
  if (!pid) throw Object.assign(new Error('FIREBASE_PROJECT_ID 환경변수가 필요합니다.'), { status: 500 })

  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== pid || payload.iss !== `https://securetoken.google.com/${pid}`) {
    throw Object.assign(new Error('다른 Firebase 프로젝트의 토큰입니다.'), { status: 401 })
  }
  if (!payload.sub || payload.exp <= now || payload.iat > now + 60) {
    throw Object.assign(new Error('만료되었거나 유효하지 않은 토큰입니다.'), { status: 401 })
  }

  return payload
}

export const setAuthCorsHeaders = (res, methods = 'GET,POST,OPTIONS') => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export const requireAllowedUser = async (req, res) => {
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!idToken) {
    res.status(401).json({ error: '로그인이 필요합니다.' })
    return null
  }

  try {
    const decoded = await verifyIdToken(idToken)
    const email = String(decoded.email || '').toLowerCase()

    if (email !== allowedEmail()) {
      res.status(403).json({ error: '허용되지 않은 계정입니다.' })
      return null
    }

    return decoded
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || '인증에 실패했습니다.' })
    return null
  }
}
