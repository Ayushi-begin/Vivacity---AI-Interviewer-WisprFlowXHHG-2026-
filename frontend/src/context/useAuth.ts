import { createContext, useContext } from 'react'
import type { TokenPair, User } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; full_name?: string }) => Promise<void>
  /** Finish a Google/GitHub sign-in with the tokens from the redirect. */
  completeOAuth: (pair: Pick<TokenPair, 'access_token' | 'refresh_token'>) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
