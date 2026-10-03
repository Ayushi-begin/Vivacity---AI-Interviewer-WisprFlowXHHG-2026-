import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { setSessionExpiredHandler } from '../api/client'
import { tokens } from '../api/tokens'
import type { TokenPair, User } from '../api/types'
import { AuthContext, type AuthStatus } from './useAuth'
import { useToast } from './useToast'

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [user, setUserState] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => (tokens.access() ? 'loading' : 'anonymous'))

  const signOutLocally = useCallback(() => {
    tokens.clear()
    setUserState(null)
    setStatus('anonymous')
  }, [])

  // The API client calls this when a 401 can't be fixed by refreshing.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      signOutLocally()
      toast.info('Your session has expired. Please sign in again.')
    })
    return () => setSessionExpiredHandler(null)
  }, [signOutLocally, toast])

  // Restore the session on page load.
  useEffect(() => {
    if (!tokens.access()) return
    let cancelled = false
    authApi
      .getMe()
      .then((me) => {
        if (cancelled) return
        setUserState(me)
        setStatus('authenticated')
      })
      .catch(() => {
        // An expired session is already handled by the client. For anything else
        // (e.g. the API is down), fall back to signed-out instead of spinning forever.
        if (!cancelled) setStatus((current) => (current === 'loading' ? 'anonymous' : current))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startSession = useCallback(async (pair: Pick<TokenPair, 'access_token' | 'refresh_token'>) => {
    tokens.set(pair)
    const me = await authApi.getMe()
    setUserState(me)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    async (email: string, password: string) => startSession(await authApi.login({ email, password })),
    [startSession],
  )

  const register = useCallback(
    async (input: { email: string; password: string; full_name?: string }) =>
      startSession(await authApi.register(input)),
    [startSession],
  )

  const logout = useCallback(async () => {
    const refresh = tokens.refresh()
    signOutLocally()
    if (refresh) await authApi.logout(refresh).catch(() => undefined) // best effort
  }, [signOutLocally])

  const setUser = useCallback((next: User) => setUserState(next), [])

  const value = useMemo(
    () => ({ user, status, login, register, completeOAuth: startSession, logout, setUser }),
    [user, status, login, register, startSession, logout, setUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
