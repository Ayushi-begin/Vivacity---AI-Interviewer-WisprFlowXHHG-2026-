import { API_BASE_URL, api } from './client'
import type { OAuthProvider, TokenPair, User } from './types'

export async function register(input: { email: string; password: string; full_name?: string }) {
  const { data } = await api.post<TokenPair>('/auth/register', input)
  return data
}

export async function login(input: { email: string; password: string }) {
  const { data } = await api.post<TokenPair>('/auth/login', input)
  return data
}

export async function logout(refreshToken: string) {
  await api.post('/auth/logout', { refresh_token: refreshToken })
}

export async function forgotPassword(email: string) {
  const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email })
  return data
}

export async function resetPassword(input: { email: string; otp: string; new_password: string }) {
  const { data } = await api.post<{ message: string }>('/auth/reset-password', input)
  return data
}

export async function getMe() {
  const { data } = await api.get<User>('/users/me')
  return data
}

export async function updateMe(input: { full_name: string | null }) {
  const { data } = await api.patch<User>('/users/me', input)
  return data
}

export function oauthLoginUrl(provider: OAuthProvider) {
  return `${API_BASE_URL}/auth/${provider}/login`
}

/**
 * Check a provider is configured before sending the browser there, so an
 * unconfigured provider shows a friendly message instead of a raw JSON error page.
 */
export async function checkOAuthProvider(provider: OAuthProvider): Promise<string | null> {
  try {
    const response = await fetch(oauthLoginUrl(provider), { redirect: 'manual' })
    if (response.type === 'opaqueredirect' || response.ok) return null
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    return body?.detail ?? `${provider} sign-in is unavailable right now.`
  } catch {
    return "Can't reach the server. Check your connection and that the API is running."
  }
}
