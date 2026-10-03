import { Check, Monitor } from 'lucide-react'
import { useTheme } from '../../context/useTheme'
import { THEMES, type ThemePreference } from '../../theme/themes'
import { useRadioGroup } from '../ui/radio'
import { ThemePreview } from './ThemePreview'

const OPTIONS: ThemePreference[] = ['system', ...THEMES.map((t) => t.id)]

/** Theme cards as an accessible radio group: arrow keys move and select. */
export function ThemePicker() {
  const { preference, setPreference } = useTheme()
  const { onKeyDown, optionProps } = useRadioGroup(OPTIONS, preference, setPreference)

  return (
    <div role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const theme = THEMES.find((t) => t.id === option)
        const selected = option === preference
        return (
          <button
            key={option}
            type="button"
            {...optionProps(option)}
            aria-label={theme ? `${theme.label}: ${theme.description}` : 'Match system: follows your device setting'}
            className={`group rounded-xl border p-2 text-left transition-all focus-visible:outline-offset-2 ${
              selected ? 'border-accent bg-accent-soft/60 ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            {theme ? (
              <ThemePreview id={theme.id} mode={theme.mode} className="h-16" />
            ) : (
              <div aria-hidden className="relative flex h-16 overflow-hidden rounded-lg border border-line">
                <ThemePreview id="light" mode="light" className="h-full flex-1 rounded-none border-0" />
                <ThemePreview id="dark" mode="dark" className="h-full flex-1 rounded-none border-0" />
                <span className="absolute inset-0 m-auto flex size-7 items-center justify-center rounded-full bg-surface text-ink shadow-card">
                  <Monitor className="size-4" />
                </span>
              </div>
            )}
            <span className="mt-2 flex items-center gap-1.5 px-0.5">
              <span className="text-sm font-medium text-ink">{theme ? theme.label : 'Match system'}</span>
              {selected && <Check aria-hidden className="ml-auto size-4 text-accent-ink" />}
            </span>
            <span className="block px-0.5 text-xs text-muted">{theme ? theme.description : 'Light or dark, like your device'}</span>
          </button>
        )
      })}
    </div>
  )
}
