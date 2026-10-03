import { createContext, useContext } from 'react'
import type { Theme, ThemePreference } from '../theme/themes'

export interface ThemeContextValue {
  /** What the user picked ("system" follows the device). */
  preference: ThemePreference
  /** The theme actually shown. */
  theme: Theme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
