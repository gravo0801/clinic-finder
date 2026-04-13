// 네이버 지역 검색 API (장소명 → 좌표)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { query } = req.query
  if (!query) return res.status(400).json({ error: 'query 필요' })

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    // API 키 없으면 네이버 지도 Geocoder 폴백 안내
    return res.status(200).json({
      items: [],
      error: 'NAVER_SEARCH_CLIENT_ID 환경변수를 설정해주세요'
    })
  }

  try {
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`
    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      }
    })
    const data = await response.json()
    return res.status(200).json({ items: data.items || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
