import { ArrowRight, CircleAlert, CircleCheck, Clock3, LineChart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { getMyAnalytics } from '../../api/analytics'
import type { Analytics } from '../../api/types'
import { ScoreChart, ScoreTable } from '../../components/dashboard/ScoreChart'
import { TopicBars } from '../../components/dashboard/TopicBars'
import { ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'

function StatTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-3xl">
        {value}
        {suffix && <span className="text-base font-medium text-muted">{suffix}</span>}
      </p>
    </Card>
  )
}

export function OverviewPage() {
  const { data, error, loading, reload } = useApi(getMyAnalytics, [])

  if (loading && !data) return <OverviewSkeleton />
  if (error || !data) return <Card><ErrorState message={error ?? 'Unknown error'} onRetry={reload} /></Card>

  const { summary } = data
  if (summary.interviews_completed === 0) {
    return (
      <Card>
        <EmptyState
          icon={LineChart}
          title="No results yet"
          description={
            summary.interviews_in_progress > 0
              ? `You have ${summary.interviews_in_progress} interview${summary.interviews_in_progress > 1 ? 's' : ''} in progress. Finish one to see your scores here.`
              : 'Complete your first mock interview to see your scores, trends and strongest topics.'
          }
          action={
            summary.interviews_in_progress > 0 ? (
              <ButtonLink to="/dashboard/history">Continue an interview</ButtonLink>
            ) : (
              <ButtonLink to="/interviews/new">Start your first interview</ButtonLink>
            )
          }
        />
      </Card>
    )
  }

  return <OverviewContent data={data} />
}

function OverviewContent({ data }: { data: Analytics }) {
  const { summary, score_history, strong_topics, weak_topics } = data
  const [view, setView] = useState<'chart' | 'table'>('chart')

  return (
    <div className="space-y-6">
      {summary.interviews_in_progress > 0 && (
        <Link
          to="/dashboard/history"
          className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-ink hover:border-accent/60"
        >
          <Clock3 aria-hidden className="size-4 shrink-0 text-accent-ink" />
          <span className="flex-1">
            You have {summary.interviews_in_progress} interview{summary.interviews_in_progress > 1 ? 's' : ''} in progress.
          </span>
          <span className="flex items-center gap-1 font-medium text-accent-ink">
            Continue <ArrowRight aria-hidden className="size-4" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Interviews completed" value={String(summary.interviews_completed)} />
        <StatTile label="Average score" value={summary.average_total?.toFixed(1) ?? '–'} suffix={`/${summary.max_total}`} />
        <StatTile label="Best score" value={String(summary.best_total ?? '–')} suffix={`/${summary.max_total}`} />
        <StatTile
          label="Average per answer"
          value={summary.average_answer_score?.toFixed(1) ?? '–'}
          suffix={`/${summary.max_answer_score}`}
        />
      </div>

      <Card>
        <CardHeader
          title="Score over time"
          description={`Total score as a percentage of ${summary.max_total}, for each completed interview`}
          action={
            <SegmentedControl
              label="Chart view"
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          }
        />
        <div className="p-4 sm:p-5">
          {view === 'chart' ? <ScoreChart points={score_history} /> : <ScoreTable points={score_history} />}
          {view === 'chart' && score_history.length === 1 && (
            <p className="mt-2 text-center text-xs text-muted">Complete another interview to see your trend.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CircleCheck aria-hidden className="size-4 text-good-ink" /> Strong topics
              </span>
            }
            description="Average 7 or higher, out of 10"
          />
          <div className="p-5">
            {strong_topics.length ? (
              <TopicBars topics={strong_topics} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">No strong topics yet. Keep practising!</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CircleAlert aria-hidden className="size-4 text-bad-ink" /> Topics to work on
              </span>
            }
            description="Average below 7, weakest first"
          />
          <div className="p-5">
            {weak_topics.length ? (
              <TopicBars topics={weak_topics} />
            ) : (
              <p className="py-6 text-center text-sm text-muted">Nothing below 7. Great work!</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your progress">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}

