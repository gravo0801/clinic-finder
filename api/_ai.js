import { fetchWithTimeout } from './_http.js'

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 9000)

const stripCodeFence = (text = '') => String(text).replace(/```json|```/g, '').trim()

export const parseJsonResponse = (text) => {
  const stripped = stripCodeFence(text)
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1))
    throw new Error('AI 응답을 JSON으로 파싱하지 못했습니다.')
  }
}

const callAnthropic = async ({ prompt, maxTokens }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 없음')

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, AI_TIMEOUT_MS)
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error?.message || `Anthropic ${response.status}`)
  return {
    text: data.content?.map((part) => part.text || '').join('\n') || '',
    provider: 'anthropic',
    model,
  }
}

const callGemini = async ({ prompt, maxTokens }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 없음')

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
  }, AI_TIMEOUT_MS)
  const data = await response.json()
  if (!response.ok || data.error) throw new Error(data.error?.message || `Gemini ${response.status}`)
  return {
    text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '',
    provider: 'gemini',
    model,
  }
}

export const callAiJson = async ({ prompt, maxTokens = 1500 }) => {
  const provider = String(process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'gemini')).toLowerCase()
  const result = provider === 'gemini'
    ? await callGemini({ prompt, maxTokens })
    : await callAnthropic({ prompt, maxTokens })

  return {
    ...result,
    json: parseJsonResponse(result.text),
  }
}
