import { ChevronLeft, ChevronRight, ChevronRight as Arrow, MessagesSquare } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { listInterviews } from '../../api/interviews'
import { DeleteInterviewButton } from '../../components/interview/DeleteInterviewButton'
import { ScorePill, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { useApi } from '../../hooks/useApi'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const PAGE_SIZE = 10
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function HistoryPage() {
  useDocumentTitle('Interview history')
  // The page number lives in the URL, so it survives refreshes and the back button.
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { data, error, loading, reload } = useApi(
    () => listInterviews({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    [page],
  )

  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading interviews">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (error || !data) return <Card><ErrorState message={error ?? 'Unknown error'} onRetry={reload} /></Card>

  if (data.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={MessagesSquare}
          title="No interviews yet"
          description="Your past and in-progress interviews will appear here."
          action={<ButtonLink to="/interviews/new">Start an interview</ButtonLink>}
        />
      </Card>
    )
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
  const goTo = (next: number) => setParams(next === 1 ? {} : { page: String(next) })

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item.id} className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to={`/interviews/${item.id}`}
              className="group flex min-w-0 flex-1 items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">
                    {item.role} <span className="font-normal text-muted">at</span> {item.company}
                  </p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {dateFmt.format(new Date(item.completed_at ?? item.created_at))}
                  {item.status === 'in_progress' &&
                    (item.answered_count >= 3 ? ' · All answered, awaiting feedback' : ` · ${item.answered_count} of 3 answered`)}
                </p>
              </div>
              {item.status === 'completed' && item.total_score != null ? (
                <ScorePill score={item.total_score} max={item.max_score} />
              ) : (
                <span className="hidden text-sm font-medium text-accent-ink sm:inline">Continue</span>
              )}
              <Arrow aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
            <DeleteInterviewButton
              compact
              interview={item}
              // The last item on a later page: step back a page instead of showing an empty one.
              onDeleted={() => (data.items.length === 1 && page > 1 ? goTo(page - 1) : reload())}
            />
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" onClick={() => goTo(page - 1)} disabled={page <= 1 || loading}>
            <ChevronLeft aria-hidden className="size-4" /> Newer
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {pages}
          </span>
          <Button variant="secondary" size="sm" onClick={() => goTo(page + 1)} disabled={page >= pages || loading}>
            Older <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      )}
    </div>
  )
}
