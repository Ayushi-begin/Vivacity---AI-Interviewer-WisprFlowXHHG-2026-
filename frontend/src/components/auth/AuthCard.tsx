import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const BENEFITS = [
  'Questions drawn from your own resume',
  'Scores out of 10 with concrete feedback',
  'A study roadmap for your weak spots',
]

/** Split auth layout: a brand panel on wide screens, the form card everywhere. */
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
  useDocumentTitle(title)
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-2 lg:py-20">
      <aside className="relative hidden overflow-hidden rounded-3xl bg-primary p-10 text-on-primary shadow-raised lg:block">
        <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-on-primary/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-80 rounded-full bg-on-primary/5" />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wide uppercase">Vivacity</p>
          <h2 className="mt-4 text-3xl leading-tight font-semibold">Practise the interview before it counts.</h2>
          <ul className="mt-8 space-y-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 text-[15px]">
                <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl bg-on-primary/10 p-5 ring-1 ring-on-primary/20">
            <p className="text-sm">Typical time to your first feedback</p>
            <p className="mt-1 text-3xl font-semibold">~10 minutes</p>
          </div>
        </div>
      </aside>

      <div className="mx-auto w-full max-w-md animate-slide-up">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-7 space-y-5">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-ink-2">{footer}</p>}
      </div>
    </div>
  )
}
