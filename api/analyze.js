// Vercel 서버리스 함수 - Claude AI 입지 분석
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
    .filter((c) => {
      const d = c.dept || ''
      return d.includes('내과') || d.includes('가정의학과') || d.includes('소화기')
    })
    .slice(0, 10)
    .map((c) => `- ${c.name} (${c.distance}m, ${c.dept})`)
    .join('\n')

  const allClinicList = nearbyClinics
    .slice(0, 20)
    .map((c) => `- ${c.name} (${c.distance}m, ${c.type})`)
    .join('\n')

  const prompt = `당신은 의원 개원 입지 분석 전문가입니다. 아래 정보를 바탕으로 가정의학과/내과 개원 관점에서 종합 입지 분석 보고서를 작성해주세요.

## 후보지 정보
- 이름: ${spot.name || '미입력'}
- 주소: ${spot.address || '미입력'}
- 입지 평점: ${RATING_LABEL[spot.rating || 0]} (${spot.rating || 0}/5)
- 특성 태그: ${spot.tags?.join(', ') || '없음'}
- 메모: ${spot.memo || '없음'}

## 주변 의료기관 현황 (심평원 데이터)
${nearbyClinics.length > 0
  ? `총 ${nearbyClinics.length}개 의료기관\n\n[직접 경쟁 의원 (내과/가정의학과/소화기내과)]\n${competitorList || '없음'}\n\n[전체 의료기관 (상위 20개)]\n${allClinicList}`
  : '아직 주변 의료기관 데이터가 없습니다. 태그와 메모 기반으로 분석합니다.'}

## 분석 요청
다음 항목을 포함한 입지 분석 보고서를 한국어로 작성해주세요:

1. **종합 평가** (3~4줄 요약)
2. **입지 강점** (bullet 3~5개)
3. **입지 약점 및 리스크** (bullet 3~5개)
4. **경쟁 환경 분석** (경쟁 강도, 틈새 기회)
5. **추천 진료과목 믹스** (메인 + 보조 진료과목 제안)
6. **개원 적합도 점수** (0~100점, 이유 포함)
7. **임장 시 중점 확인사항** (3~5개)

실용적이고 구체적으로 작성해주세요.`

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    if (data.error) throw new Error(data.error.message)

    const text = data.content?.[0]?.text || ''
    return res.status(200).json({ analysis: text })
  } catch (err) {
    console.error('Anthropic error:', err)
    return res.status(500).json({ error: err.message })
  }
}
