import { useEffect, useState, type ReactNode } from 'react'

/**
 * Full-screen wait for the slow AI steps (question generation, final evaluation).
 * Cycles through what's happening so a 10–20 second wait doesn't feel frozen.
 */
export function LoadingScreen({
  title,
  steps,
  note,
  action,
}: {
  title: string
  steps: string[]
  note?: string
  action?: ReactNode
}) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), 3000)
    return () => window.clearInterval(timer)
  }, [steps.length])

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-bg/95 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto size-20" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
          <span className="absolute inset-2 animate-pulse rounded-full bg-accent/30" />
          <span className="absolute inset-5 flex items-center justify-center rounded-full bg-primary text-on-primary">
            <svg viewBox="0 0 32 32" className="size-6">
              <path d="M9 10l7 13 7-13" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <h2 className="mt-8 text-xl font-semibold text-ink">{title}</h2>
        <ol className="mt-5 space-y-2 text-left">
          {steps.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < index ? 'bg-primary text-on-primary' : i === index ? 'border-2 border-accent' : 'border border-line'
                }`}
                aria-hidden
              >
                {i < index ? '✓' : ''}
              </span>
              <span className={i === index ? 'font-medium text-ink' : i < index ? 'text-ink-2' : 'text-muted'}>{step}</span>
            </li>
          ))}
        </ol>
        {note && <p className="mt-6 text-xs leading-relaxed text-muted">{note}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}
