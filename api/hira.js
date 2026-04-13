// Vercel 서버리스 함수 - 심평원 API 프록시
// CORS 문제 없이 클라이언트에서 심평원 API 호출 가능

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { lat, lng, radius = 1000 } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat, lng 파라미터가 필요합니다.' })
  }

  const serviceKey = process.env.PUBLIC_DATA_API_KEY
  if (!serviceKey) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' })
  }

  try {
    // 심평원 요양기관 현황 API (좌표 기반)
    const url =
      `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList` +
      `?serviceKey=${serviceKey}` +
      `&xPos=${lng}` +
      `&yPos=${lat}` +
      `&radius=${radius}` +
      `&numOfRows=100` +
      `&pageNo=1` +
      `&_type=json`

    const response = await fetch(url)
    const data = await response.json()

    const items = data?.response?.body?.items?.item
    if (!items) {
      return res.status(200).json({ items: [], total: 0 })
    }

    const list = Array.isArray(items) ? items : [items]

    // 의원/병원만 필터링 + 거리 계산
    const filtered = list
      .filter((item) => {
        const type = item.clCdNm || ''
        return type.includes('의원') || type.includes('병원')
      })
      .map((item) => ({
        id: item.ykiho,
        name: item.yadmNm,
        type: item.clCdNm,
        dept: item.dgsbjtCdNm || '',
        address: item.addr,
        tel: item.telno,
        lat: parseFloat(item.YPos),
        lng: parseFloat(item.XPos),
        distance: calcDistance(
          parseFloat(lat),
          parseFloat(lng),
          parseFloat(item.YPos),
          parseFloat(item.XPos)
        ),
      }))
      .sort((a, b) => a.distance - b.distance)

    return res.status(200).json({ items: filtered, total: filtered.length })
  } catch (err) {
    console.error('HIRA API error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Haversine 거리 계산 (미터)
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
