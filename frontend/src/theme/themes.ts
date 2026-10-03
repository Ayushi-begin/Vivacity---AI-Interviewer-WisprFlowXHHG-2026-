/**
 * The available themes. Colours live in src/index.css ([data-theme='…'] blocks).
 * Keep the ids in sync with that file and with the pre-paint script in public/theme-init.js.
 */
export const THEMES = [
  { id: 'light', label: 'Light', mode: 'light', description: 'Clean and bright' },
  { id: 'dark', label: 'Dark', mode: 'dark', description: 'Easy on the eyes at night' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light', description: 'Warm, low-glare classic' },
  { id: 'solarized-dark', label: 'Solarized Dark', mode: 'dark', description: 'The classic deep-teal palette' },
  { id: 'parchment', label: 'Parchment', mode: 'light', description: 'Beige paper with coffee-brown ink' },
] as const

export type Theme = (typeof THEMES)[number]
export type ThemeId = Theme['id']
export type ThemePreference = ThemeId | 'system'

export const isThemeId = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value)

export const themeById = (id: ThemeId): Theme => THEMES.find((t) => t.id === id)!
