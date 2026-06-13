export const config = {
  api: {
    bodyParser: false,
  },
}

const hopByHopHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return chunks.length ? Buffer.concat(chunks) : undefined
}

const authDomain = () => process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN

const pathFromQuery = (value) => {
  const path = Array.isArray(value) ? value.join('/') : value
  return String(path || '').split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')
}

export default async function handler(req, res) {
  const firebaseAuthDomain = authDomain()
  if (!firebaseAuthDomain) {
    res.status(500).json({ error: 'Firebase auth domain is not configured.' })
    return
  }

  const upstreamPath = pathFromQuery(req.query.firebaseAuthPath)
  const upstreamUrl = new URL(`https://${firebaseAuthDomain}/__/auth/${upstreamPath}`)

  Object.entries(req.query).forEach(([key, value]) => {
    if (key === 'firebaseAuthPath') return
    const values = Array.isArray(value) ? value : [value]
    values.filter((item) => item != null).forEach((item) => upstreamUrl.searchParams.append(key, item))
  })

  const headers = {}
  Object.entries(req.headers).forEach(([key, value]) => {
    if (!hopByHopHeaders.has(key.toLowerCase()) && value != null) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value
    }
  })

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req)
  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  })

  res.status(upstream.status)
  upstream.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase()
    if (hopByHopHeaders.has(normalizedKey)) return

    if (normalizedKey === 'location') {
      const host = req.headers.host
      const rewritten = value.replace(`https://${firebaseAuthDomain}/__/auth/`, `https://${host}/__/auth/`)
      res.setHeader(key, rewritten)
      return
    }

    res.setHeader(key, value)
  })

  const buffer = Buffer.from(await upstream.arrayBuffer())
  res.end(buffer)
}
