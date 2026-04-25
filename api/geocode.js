// 네이버 역지오코딩 API - 좌표 → 주소
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { lat, lng } = req.query
  if (!lat || !lng) return res.status(400).json({ error: 'lat, lng 필요' })

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(200).json({ address: '' })
  }

  try {
    const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc` +
      `?coords=${lng},${lat}&orders=roadaddr,addr&output=json`

    const response = await fetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      }
    })
    const data = await response.json()

    // 도로명 주소 우선, 없으면 지번
    const road = data.results?.find((r) => r.name === 'roadaddr')
    const addr = data.results?.find((r) => r.name === 'addr')

    let address = ''
    if (road) {
      const r = road.region
      const land = road.land
      address = `${r.area1.name} ${r.area2.name} ${land.name} ${land.number1}${land.number2 ? '-' + land.number2 : ''}`.trim()
    } else if (addr) {
      const r = addr.region
      const land = addr.land
      address = `${r.area1.name} ${r.area2.name} ${r.area3.name} ${land.number1}${land.number2 ? '-' + land.number2 : ''}`.trim()
    }

    return res.status(200).json({ address })
  } catch (err) {
    console.error('역지오코딩 오류:', err)
    return res.status(200).json({ address: '' })
  }
}
