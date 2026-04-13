// Vercel 서버리스 함수 - 심평원 API 프록시

// 이름에 이것이 있으면 무조건 경쟁 (과목 무관)
const STRONG_COMPETITOR_NAME = [
  '365', '24시', '내과', '가정의학', '일반의원',
  '검진', '종합클리닉', '종합의원', '패밀리', '가족의원',
  '건강검진', '내과의원', '내과클리닉',
]

// 진료과에 이것이 있으면 경쟁
const COMPETITOR_DEPT = [
  '가정의학과', '내과', '일반의', '검진',
]

// 전문과만 있는 의원 = 비경쟁 (이 과목들로만 이루어진 경우)
const SPECIALIST_ONLY_DEPT = [
  '안과', '정형외과', '성형외과', '피부과', '산부인과',
  '이비인후과', '비뇨의학과', '신경외과', '신경과',
  '정신건강의학과', '재활의학과', '흉부외과', '영상의학과',
  '마취통증의학과', '치과', '한의원', '한방',
  '소아청소년과', '산부인과', '구강악안면외과',
]

function isCompetitor(dept = '', name = '') {
  // 1단계: 이름에 강력한 경쟁 키워드 있으면 무조건 경쟁
  if (STRONG_COMPETITOR_NAME.some((k) => name.includes(k))) return true

  // 2단계: 진료과에 경쟁 과목 포함되면 경쟁
  if (COMPETITOR_DEPT.some((k) => dept.includes(k))) return true

  // 3단계: 진료과 정보가 없는 일반 의원 → 잠재 경쟁
  if (!dept.trim()) {
    if (name.includes('의원') || name.includes('클리닉')) return true
  }

  // 4단계: 진료과가 전문과로만 구성된 경우만 비경쟁
  const deptList = dept.split(',').map((d) => d.trim()).filter(Boolean)
  if (deptList.length > 0) {
    const allSpecialist = deptList.every((d) =>
      SPECIALIST_ONLY_DEPT.some((s) => d.includes(s))
    )
    if (allSpecialist) return false
    // 전문과 아닌 과목이 있으면 경쟁 가능성
    return true
  }

  return false
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
    console.error('HIRA API error:', err)
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
