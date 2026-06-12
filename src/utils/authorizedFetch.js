import { auth } from '../firebase'

export const authorizedFetch = async (input, init = {}) => {
  const user = auth.currentUser
  if (!user || user.isAnonymous) throw new Error('Google 로그인이 필요합니다.')

  const token = await user.getIdToken()
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  return fetch(input, {
    ...init,
    headers,
  })
}
