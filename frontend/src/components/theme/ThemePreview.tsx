import type { ThemeId } from '../../theme/themes'

/**
 * A miniature of the app painted with the real theme tokens: the wrapper sets
 * data-theme, so every colour below comes from that theme's CSS block.
 */
export function ThemePreview({ id, mode, className = '' }: { id: ThemeId; mode: 'light' | 'dark'; className?: string }) {
  return (
    <div data-theme={id} data-mode={mode} aria-hidden className={`overflow-hidden rounded-lg border border-line bg-bg ${className}`}>
      <div className="flex h-full gap-1.5 p-1.5">
        <div className="flex flex-1 flex-col gap-1 rounded-md border border-line bg-surface p-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-ink" />
          <div className="h-1.5 w-1/2 rounded-full bg-muted/70" />
          <svg viewBox="0 0 60 18" className="mt-auto h-4 w-full" preserveAspectRatio="none">
            <path d="M0 15 L15 11 L30 12 L45 6 L60 3" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex w-1/4 flex-col gap-1">
          <div className="h-3 rounded bg-primary" />
          <div className="flex-1 rounded bg-surface-2" />
        </div>
      </div>
    </div>
  )
}

/** Two dots of a theme's colours, for compact menus. */
export function ThemeDots({ id, mode }: { id: ThemeId; mode: 'light' | 'dark' }) {
  return (
    <span
      data-theme={id}
      data-mode={mode}
      aria-hidden
      className="relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-bg"
    >
      <span className="absolute inset-y-0 right-0 w-1/2 bg-primary" />
    </span>
  )
}
