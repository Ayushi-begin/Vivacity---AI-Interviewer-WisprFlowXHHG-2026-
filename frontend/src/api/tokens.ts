import type { TokenPair } from './types'

const ACCESS_KEY = 'vivacity.access_token'
const REFRESH_KEY = 'vivacity.refresh_token'

// Storage can throw (private mode, blocked site data), so every access is guarded.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const tokens = {
  access: () => read(ACCESS_KEY),
  refresh: () => read(REFRESH_KEY),
  set(pair: Pick<TokenPair, 'access_token' | 'refresh_token'>) {
    try {
      localStorage.setItem(ACCESS_KEY, pair.access_token)
      localStorage.setItem(REFRESH_KEY, pair.refresh_token)
    } catch {
      /* the session then lasts only for this page load */
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* nothing to clear */
    }
  },
}
