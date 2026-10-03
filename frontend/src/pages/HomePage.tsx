import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  Flag,
  MessageSquareText,
  MinusCircle,
  Route,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Badge, ScorePill } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { useAuth } from '../context/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const STEPS = [
  {
    icon: FileText,
    title: 'Upload your resume',
    body: 'Pick the role and company you’re aiming for. Questions are drawn from your actual experience.',
  },
  {
    icon: MessageSquareText,
    title: 'Answer three questions',
    body: 'One at a time, at your own pace. Leave whenever you like. Your progress is saved.',
  },
  {
    icon: Route,
    title: 'Get scores and a plan',
    body: 'Every answer is scored out of 10 with what worked, what was missing and a stronger version.',
  },
]

const FEATURES = [
  { icon: Sparkles, title: 'Tailored to you', body: 'No generic question banks. Every question references your resume.' },
  { icon: BarChart3, title: 'Track your progress', body: 'Scores over time, plus your strongest and weakest topics.' },
  { icon: Trophy, title: 'Friendly competition', body: 'Compare best scores on the leaderboard. Only names are shown.' },
  { icon: ShieldCheck, title: 'Private by default', body: 'Your resume and answers are only ever visible to you.' },
]

/** Decorative product preview, built from the real UI components. */
function ProductPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
      <figcaption className="sr-only">
        Example: an interview question about system design, the candidate's answer, and feedback scoring it 8 out of
        10 with a study roadmap.
      </figcaption>
      <div aria-hidden className="relative">
        <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent-soft/70 blur-2xl" />
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-raised sm:p-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-sm font-semibold text-ink">Backend Engineer · Stripe</p>
              <p className="text-xs text-muted">Question 2 of 3</p>
            </div>
            <Badge tone="accent">System Design</Badge>
          </div>
          <div className="mt-4 flex gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <Bot className="size-3.5" />
            </span>
            <p className="rounded-2xl rounded-tl-sm border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink">
              You cut p99 latency by 40% on the payments API. Walk me through how you found the bottleneck.
            </p>
          </div>
          <div className="mt-3 ml-9 rounded-2xl rounded-tr-sm bg-accent-soft px-3.5 py-2.5 text-sm text-ink">
            We traced slow requests to lock contention on the ledger table, then sharded by merchant…
          </div>
          <div className="mt-4 rounded-xl border border-line p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Feedback</span>
              <ScorePill score={8} />
            </div>
            <p className="mt-2.5 flex gap-1.5 text-xs text-ink-2">
              <CheckCircle2 className="mt-px size-3.5 shrink-0 text-good-ink" /> Clear diagnosis with real numbers.
            </p>
            <p className="mt-1.5 flex gap-1.5 text-xs text-ink-2">
              <MinusCircle className="mt-px size-3.5 shrink-0 text-bad-ink" /> Mention how you validated the fix.
            </p>
          </div>
        </div>
        <div className="absolute -right-3 -bottom-8 hidden w-56 rounded-xl border border-line bg-surface p-3.5 shadow-overlay sm:block lg:-right-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Flag className="size-3.5 text-accent" /> Study roadmap
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            <li className="flex items-center justify-between">
              Load testing <Badge tone="bad">High</Badge>
            </li>
            <li className="flex items-center justify-between">
              Caching strategies <Badge tone="warn">Medium</Badge>
            </li>
          </ul>
        </div>
      </div>
    </figure>
  )
}

export function HomePage() {
  useDocumentTitle(null)
  const { user } = useAuth()
  const primary = user
    ? { to: '/interviews/new', label: 'Start a mock interview' }
    : { to: '/signup', label: 'Get started free' }

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        {/* Soft dotted grid behind the hero. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
          style={{ backgroundImage: 'radial-gradient(var(--line-strong) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: 0.25 }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-card">
              <Sparkles aria-hidden className="size-3.5 text-accent" /> AI interviewer, built on your resume
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              Walk into your next interview <span className="text-accent-ink">already practised</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-2 sm:text-lg lg:mx-0">
              Vivacity reads your resume, asks the questions a real interviewer would, then scores every answer and builds
              you a study plan for the gaps.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <ButtonLink to={primary.to} size="lg" className="w-full sm:w-auto">
                {primary.label} <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink to={user ? '/dashboard' : '/login'} size="lg" variant="secondary" className="w-full sm:w-auto">
                {user ? 'Go to dashboard' : 'I have an account'}
              </ButtonLink>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 text-left">
              {[
                ['3', 'tailored questions'],
                ['10-point', 'scoring rubric'],
                ['1', 'personal roadmap'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-xl font-semibold text-ink sm:text-2xl">{value}</dd>
                  <dd className="text-xs text-muted sm:text-sm">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-accent-ink">How it works</p>
          <h2 id="how" className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            From resume to study plan in minutes
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="relative rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted tabular-nums">0{index + 1}</span>
              </div>
              <h3 className="mt-5 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="features" className="sr-only">
            Features
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon aria-hidden className="size-5 text-accent" />
                <h3 className="mt-3 font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-14 flex flex-col items-center justify-between gap-5 rounded-2xl border border-line bg-bg p-6 text-center sm:flex-row sm:p-8 sm:text-left">
            <div>
              <p className="text-lg font-semibold text-ink">Ready for a practice round?</p>
              <p className="mt-1 text-sm text-ink-2">It takes about ten minutes, and you’ll know exactly what to work on next.</p>
            </div>
            <ButtonLink to={primary.to} size="lg" className="w-full shrink-0 sm:w-auto">
              {primary.label} <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  )
}
