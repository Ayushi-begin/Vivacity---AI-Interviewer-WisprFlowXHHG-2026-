import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokens } from './tokens'
import type { TokenPair } from './types'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
).replace(/\/+$/, '')

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Starting an interview reads the PDF and writes the questions before it responds.
  timeout: 90_000,
})

// A 401 from these means "wrong credentials", not "session expired".
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password']

const isAuthEndpoint = (url = '') => AUTH_ENDPOINTS.some((path) => url.endsWith(path))

let onSessionExpired: (() => void) | null = null

/** AuthContext registers this to sign the user out when the session can't be renewed. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

api.interceptors.request.use((config) => {
  const access = tokens.access()
  if (access) config.headers.Authorization = `Bearer ${access}`
  return config
})

// Every request that hits a 401 at the same moment shares one refresh call.
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokens.refresh()
  if (!refresh) return null
  try {
    // A bare axios call, so this request skips the interceptors below.
    const { data } = await axios.post<TokenPair>(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refresh,
    })
    tokens.set(data)
    return data.access_token
  } catch {
    return null
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    if (error.response?.status !== 401 || !original || isAuthEndpoint(original.url)) {
      throw error
    }

    // The access token expired: refresh once and replay the request.
    if (!original._retried) {
      original._retried = true
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null
      })
      const access = await refreshInFlight
      if (access) {
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      }
    }

    // Refresh failed, or the replayed request was still unauthorised: log out.
    tokens.clear()
    onSessionExpired?.()
    throw error
  },
)
