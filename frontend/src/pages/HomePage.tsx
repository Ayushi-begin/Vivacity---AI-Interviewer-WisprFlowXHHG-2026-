import { ArrowRight, BarChart3, FileText, MessageSquareText, Route, Sparkles, Trophy } from 'lucide-react'
import { ButtonLink } from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  {
    icon: FileText,
    title: 'Upload your resume',
    body: 'Pick the role and company you’re aiming for. Questions are drawn from your actual experience.',
  },
  {
    icon: MessageSquareText,
    title: 'Answer three questions',
    body: 'One at a time, at your own pace. Close the tab whenever you like. Your progress is saved.',
  },
  {
    icon: Route,
    title: 'Get scores and a plan',
    body: 'Each answer is scored out of 10 with what worked, what was missing and a stronger answer.',
  },
]

const FEATURES = [
  { icon: Sparkles, title: 'Tailored to you', body: 'No generic question banks. Every question references your resume.' },
  { icon: BarChart3, title: 'Track progress', body: 'See your scores over time and which topics are strong or weak.' },
  { icon: Trophy, title: 'Friendly competition', body: 'Compare best scores on the leaderboard. Only names are shown.' },
]

export function HomePage() {
  const { user } = useAuth()
  const primary = user ? { to: '/interviews/new', label: 'Start a mock interview' } : { to: '/signup', label: 'Get started free' }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="py-16 text-center sm:py-24">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2">
          <Sparkles aria-hidden className="size-3.5 text-accent" /> AI interviewer · built on your resume
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-6xl">
          Walk into your next interview <span className="text-accent">already practised</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-2 sm:text-lg">
          Vivacity reads your resume, asks the questions a real interviewer would, then scores every answer and
          builds you a study plan for the gaps.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink to={primary.to} size="lg" className="w-full sm:w-auto">
            {primary.label} <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
          {user ? (
            <ButtonLink to="/dashboard" size="lg" variant="secondary" className="w-full sm:w-auto">
              Go to dashboard
            </ButtonLink>
          ) : (
            <ButtonLink to="/login" size="lg" variant="secondary" className="w-full sm:w-auto">
              I have an account
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-labelledby="how" className="pb-16">
        <h2 id="how" className="text-center text-sm font-semibold tracking-wide text-muted uppercase">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-xs font-semibold text-muted">STEP {index + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Features" className="grid gap-6 border-t border-line py-14 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <h3 className="font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-2">{body}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
