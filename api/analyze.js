export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API 키 미설정' })

  const { spot, nearbyClinics = [] } = req.body
  if (!spot) return res.status(400).json({ error: 'spot 데이터 필요' })

  const RATING_LABEL = ['미평가', '검토필요', '보통', '양호', '우수', '최우수']

  const competitorList = nearbyClinics
    .filter((c) => c.isCompetitor)
    .slice(0, 10)
    .map((c) => `- ${c.name} (${c.distance}m, ${c.dept || '진료과 미상'})`)
    .join('\n')

  const prompt = `당신은 의원 개원 입지 분석 전문가입니다. 아래 정보를 바탕으로 가정의학과/내과 + 내시경 클리닉 공동개원 관점에서 입지를 분석하세요.

## 후보지 정보
- 이름: ${spot.name || '미입력'}
- 주소: ${spot.address || '미입력'}
- 입지 평점: ${RATING_LABEL[spot.rating || 0]} (${spot.rating || 0}/5)
- 특성 태그: ${spot.tags?.join(', ') || '없음'}
- 메모: ${spot.memo || '없음'}

## 주변 의료기관 (심평원 데이터)
${nearbyClinics.length > 0
  ? `총 ${nearbyClinics.length}개\n경쟁 의원:\n${competitorList || '없음'}`
  : '데이터 없음 - 태그/메모 기반으로만 분석'}

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만:

{
  "score": 75,
  "grade": "개원 검토 가능",
  "summary": "3~4줄 종합 평가 텍스트",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2", "약점3"],
  "competitor_analysis": "경쟁 환경 분석 텍스트 (2~3줄)",
  "recommended_specialties": ["추천 진료과목1", "추천 진료과목2"],
  "checkpoints": ["임장 시 확인사항1", "임장 시 확인사항2", "임장 시 확인사항3"],
  "endoscopy_fit": "내시경 클리닉 적합성 평가 (1~2줄)",
  "oncology_fit": "종양내과 협업 적합성 평가 (1~2줄)"
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message)

    let text = data.content?.[0]?.text || ''
    // JSON 파싱
    text = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return res.status(200).json({ result: parsed })
  } catch (err) {
    console.error('AI 분석 오류:', err)
    return res.status(500).json({ error: err.message })
  }
}
