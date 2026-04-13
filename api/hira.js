// 경쟁 의원 판단 - 단순 화이트리스트 방식
// 이름 또는 진료과에 아래 키워드가 있어야만 경쟁으로 분류
const COMPETITOR_WHITELIST = [
  '내과', '가정의학', '365', '24시간', '패밀리클리닉',
]

function isCompetitor(dept = '', name = '') {
  const combined = name + dept
  return COMPETITOR_WHITELIST.some((k) => combined.includes(k))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { lat, lng, radius = 1000 } = req.query
  if (!lat || !lng) return res.status(400).json({ error: 'lat, lng 필요' })

  const serviceKey = process.env.PUBLIC_DATA_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'API 키 미설정' })

  try {
    const url =
      `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList` +
      `?serviceKey=${serviceKey}` +
      `&xPos=${lng}&yPos=${lat}&radius=${radius}` +
      `&numOfRows=100&pageNo=1&_type=json`

    const response = await fetch(url)
    const data = await response.json()
    const items = data?.response?.body?.items?.item
    if (!items) return res.status(200).json({ items: [], total: 0 })

    const list = Array.isArray(items) ? items : [items]

    const filtered = list
      .filter((item) => {
        const type = item.clCdNm || ''
        return type.includes('의원') || type.includes('병원')
      })
      .map((item) => {
        const dept = item.dgsbjtCdNm || ''
        const name = item.yadmNm || ''
        return {
          id: item.ykiho,
          name,
          type: item.clCdNm,
          dept,
          address: item.addr,
          tel: item.telno,
          lat: parseFloat(item.YPos),
          lng: parseFloat(item.XPos),
          distance: calcDistance(
            parseFloat(lat), parseFloat(lng),
            parseFloat(item.YPos), parseFloat(item.XPos)
          ),
          isCompetitor: isCompetitor(dept, name),
        }
      })
      .sort((a, b) => a.distance - b.distance)

    return res.status(200).json({ items: filtered, total: filtered.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function calcDistance(lat1, lng1, lat2, lng2) {
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
