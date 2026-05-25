import { createHash } from 'node:crypto'

const COMPETITOR_WHITELIST = ['내과', '가정의학', '365', '24시간', '패밀리클리닉', '검진', '내시경']

const clean = (value) => String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const isCompetitor = (dept = '', name = '') => {
  const combined = `${name} ${dept}`
  return COMPETITOR_WHITELIST.some((keyword) => combined.includes(keyword))
}

const normalizeItems = (items) => {
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

const stableId = (...parts) => `naver_${createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 18)}`

const isClinicCategory = (name = '', category = '', type = '') => {
  const combined = `${name} ${category} ${type}`
  return ['의원', '병원', '내과', '가정의학', '검진', '영상의학'].some((keyword) => combined.includes(keyword))
}

const calcDistance = (lat1, lng1, lat2, lng2) => {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

const toNaverCoordinate = (value, kind) => {
  const parsed = toNumber(value)
  if (parsed === null) return null
  const scaled = Math.abs(parsed) > 1000 ? parsed / 1e7 : parsed
  if (kind === 'lat' && (scaled < 30 || scaled > 45)) return null
  if (kind === 'lng' && (scaled < 120 || scaled > 135)) return null
  return scaled
}

const sortByDistance = (a, b) => {
  if (a.distance === null && b.distance === null) return a.name.localeCompare(b.name, 'ko')
  if (a.distance === null) return 1
  if (b.distance === null) return -1
  return a.distance - b.distance
}

const dedupeKey = (item) => `${clean(item.name).replace(/\s+/g, '')}|${clean(item.address).slice(0, 24)}`

const mergeResults = (...groups) => {
  const merged = new Map()
  groups.flat().forEach((item) => {
    const key = dedupeKey(item)
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, item)
      return
    }
    merged.set(key, {
      ...previous,
      ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== null && value !== '')),
      id: previous.hiraId ? previous.id : item.id,
      hiraId: previous.hiraId || item.hiraId || null,
      source: previous.hiraId ? previous.source : item.source,
      webLink: previous.webLink || item.webLink || '',
    })
  })
  return [...merged.values()].sort(sortByDistance)
}

const searchHira = async (query, originLat, originLng, serviceKey) => {
  if (!serviceKey) return { items: [], status: 'missing_key', message: 'PUBLIC_DATA_API_KEY 미설정' }

  const params = new URLSearchParams({
    serviceKey,
    yadmNm: clean(query),
    numOfRows: '30',
    pageNo: '1',
    _type: 'json',
  })
  const url = `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?${params.toString()}`
  const response = await fetch(url)
  const data = await response.json()
  const resultCode = data?.response?.header?.resultCode
  const resultMsg = data?.response?.header?.resultMsg
  if (resultCode && resultCode !== '00') throw new Error(resultMsg || `OpenAPI ${resultCode}`)

  const items = normalizeItems(data?.response?.body?.items?.item)
    .filter((item) => isClinicCategory(item.yadmNm, item.dgsbjtCdNm, item.clCdNm))
    .map((item) => {
      const itemLat = toNumber(item.YPos)
      const itemLng = toNumber(item.XPos)
      const dept = clean(item.dgsbjtCdNm)
      const name = clean(item.yadmNm)
      return {
        id: item.ykiho,
        hiraId: item.ykiho,
        source: 'hira',
        name,
        type: clean(item.clCdNm),
        dept,
        address: clean(item.addr),
        tel: clean(item.telno),
        lat: itemLat,
        lng: itemLng,
        distance: calcDistance(originLat, originLng, itemLat, itemLng),
        isCompetitor: isCompetitor(dept, name),
      }
    })
    .filter((item) => item.id && item.name)

  return { items, status: items.length ? 'ok' : 'empty', message: items.length ? 'HIRA 검색 수신' : 'HIRA 검색 결과 없음' }
}

const searchNaverLocal = async (query, originLat, originLng) => {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret) return { items: [], status: 'missing_key', message: 'NAVER_SEARCH 키 미설정' }

  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`
  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  const data = await response.json()
  if (!response.ok || data.errorCode) throw new Error(data.errorMessage || 'Naver local error')

  const items = normalizeItems(data.items)
    .map((item) => {
      const name = clean(item.title)
      const category = clean(item.category)
      const address = clean(item.roadAddress || item.address)
      const lat = toNaverCoordinate(item.mapy, 'lat')
      const lng = toNaverCoordinate(item.mapx, 'lng')
      const dept = category.split('>').pop() || ''
      return {
        id: stableId(name, address, item.link),
        hiraId: null,
        source: 'naver',
        name,
        type: clean(category.split('>').slice(-2, -1)[0]) || '의료기관',
        dept: clean(dept),
        address,
        tel: clean(item.telephone),
        lat,
        lng,
        distance: calcDistance(originLat, originLng, lat, lng),
        isCompetitor: isCompetitor(dept, name),
        webLink: item.link || '',
      }
    })
    .filter((item) => item.name && isClinicCategory(item.name, item.dept, item.type))

  return { items, status: items.length ? 'ok' : 'empty', message: items.length ? '네이버 지역검색 수신' : '네이버 지역검색 결과 없음' }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { query, lat, lng } = req.query
  if (!query || clean(query).length < 2) return res.status(400).json({ error: '검색어를 2글자 이상 입력하세요.' })

  try {
    const originLat = toNumber(lat)
    const originLng = toNumber(lng)
    const sourceStatus = {}
    let hira = { items: [], status: 'pending', message: '' }
    let naver = { items: [], status: 'pending', message: '' }

    try {
      hira = await searchHira(query, originLat, originLng, process.env.PUBLIC_DATA_API_KEY)
    } catch (error) {
      hira = { items: [], status: 'error', message: error.message }
    }

    try {
      naver = await searchNaverLocal(query, originLat, originLng)
    } catch (error) {
      naver = { items: [], status: 'error', message: error.message }
    }

    sourceStatus.hira = { status: hira.status, message: hira.message }
    sourceStatus.naverLocal = { status: naver.status, message: naver.message }

    const items = mergeResults(hira.items, naver.items)
    if (!items.length && hira.status === 'missing_key' && naver.status === 'missing_key') {
      return res.status(500).json({ error: 'PUBLIC_DATA_API_KEY 또는 NAVER_SEARCH 키가 필요합니다.', sources: sourceStatus })
    }

    return res.status(200).json({ items, total: items.length, sources: sourceStatus })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
