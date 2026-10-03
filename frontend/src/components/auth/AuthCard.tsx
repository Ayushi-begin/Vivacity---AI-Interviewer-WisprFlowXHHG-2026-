import type { ReactNode } from 'react'

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem-4.5rem)] items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-md animate-slide-up">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-6 space-y-5">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-ink-2">{footer}</p>}
      </div>
    </div>
  )
}
