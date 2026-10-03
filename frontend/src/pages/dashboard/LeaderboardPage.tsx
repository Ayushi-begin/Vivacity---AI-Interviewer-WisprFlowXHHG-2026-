import { Medal, Search, Trophy, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { getLeaderboard } from '../../api/analytics'
import type { LeaderboardEntry, LeaderboardPeriod } from '../../api/types'
import { Badge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: '30 days' },
  { value: 'week', label: '7 days' },
]

function Rank({ rank }: { rank: number }) {
  if (rank > 3) return <span className="w-8 text-center text-sm font-semibold text-muted tabular-nums">{rank}</span>
  // Top three get a medal icon plus the number, so position never depends on colour alone.
  return (
    <span className="flex w-8 flex-col items-center text-accent-ink" aria-label={`Rank ${rank}`}>
      <Medal aria-hidden className="size-4" />
      <span className="text-[11px] font-bold tabular-nums">{rank}</span>
    </span>
  )
}

function Row({ entry, max }: { entry: LeaderboardEntry; max: number }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 ${entry.is_you ? 'bg-accent-soft' : ''}`}
      aria-current={entry.is_you || undefined}
    >
      <Rank rank={entry.rank} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium text-ink">
          <span className="truncate">{entry.name}</span>
          {entry.is_you && <Badge tone="accent">You</Badge>}
        </p>
        <p className="text-xs text-muted">
          {entry.interviews_completed} interview{entry.interviews_completed === 1 ? '' : 's'} · avg{' '}
          {entry.average_score.toFixed(1)}
        </p>
      </div>
      <p className="text-right">
        <span className="text-lg font-semibold text-ink tabular-nums">{entry.best_score}</span>
        <span className="text-sm text-muted">/{max}</span>
        <span className="block text-[11px] text-muted">best</span>
      </p>
    </li>
  )
}

export function LeaderboardPage() {
  useDocumentTitle('Leaderboard')
  const [period, setPeriod] = useState<LeaderboardPeriod>('all')
  const [filters, setFilters] = useState({ role: '', company: '' })
  const [draft, setDraft] = useState(filters)
  const { data, error, loading, reload } = useApi(
    () => getLeaderboard({ period, role: filters.role, company: filters.company }),
    [period, filters],
  )

  const apply = (event: FormEvent) => {
    event.preventDefault()
    setFilters({ role: draft.role.trim(), company: draft.company.trim() })
  }
  const clear = () => {
    setDraft({ role: '', company: '' })
    setFilters({ role: '', company: '' })
  }
  const filtered = Boolean(filters.role || filters.company)
  const youOutsideTop = data?.you && !data.entries.some((e) => e.is_you)

  return (
    <div className="space-y-4">
      {/* Filters sit in one row above the results. */}
      <Card className="p-4">
        <form onSubmit={apply} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SegmentedControl label="Time period" options={PERIODS} value={period} onChange={setPeriod} />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:gap-3">
            <Input
              aria-label="Filter by role"
              placeholder="Role (e.g. Backend Engineer)"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            />
            <Input
              aria-label="Filter by company"
              placeholder="Company"
              value={draft.company}
              onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
              <Search aria-hidden className="size-4" /> Filter
            </Button>
            {filtered && (
              <Button variant="ghost" onClick={clear} aria-label="Clear filters">
                <X aria-hidden className="size-4" /> Clear
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {loading && !data ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading leaderboard">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error || !data ? (
          <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />
        ) : data.entries.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={filtered || period !== 'all' ? 'No results for these filters' : 'The leaderboard is empty'}
            description={
              filtered || period !== 'all'
                ? 'Try a wider time period or clear the filters.'
                : 'Complete an interview to claim the top spot.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <ButtonLink to="/interviews/new">Start an interview</ButtonLink>
              )
            }
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs font-medium text-muted">
              <span>Ranked by best score · names only</span>
              <span className={loading ? 'opacity-100' : 'opacity-0'} aria-hidden={!loading}>
                Updating…
              </span>
            </div>
            <ol className="divide-y divide-line">
              {data.entries.map((entry) => (
                <Row key={`${entry.rank}-${entry.name}-${entry.is_you}`} entry={entry} max={data.max_score} />
              ))}
            </ol>
            {youOutsideTop && data.you && (
              <div className="border-t-2 border-dashed border-line">
                <p className="px-5 pt-3 text-xs font-medium text-muted">Your position</p>
                <ol>
                  <Row entry={data.you} max={data.max_score} />
                </ol>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
