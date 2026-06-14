export const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 10000)

export const fetchWithTimeout = async (url, options = {}, timeoutMs = API_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`요청 시간이 초과되었습니다 (${Math.round(timeoutMs / 1000)}초).`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const readJson = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text }
  }
}
