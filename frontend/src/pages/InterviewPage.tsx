import { ArrowLeft, FileQuestion, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getErrorMessage, getStatus } from '../api/errors'
import { getInterview, retryInterview, submitAnswer } from '../api/interviews'
import type { Interview } from '../api/types'
import { AnswerComposer, CandidateBubble, InterviewerBubble } from '../components/interview/Chat'
import { LoadingScreen } from '../components/interview/LoadingScreen'
import { QuestionFeedback, RoadmapView, ScoreSummary } from '../components/interview/Results'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { StatusBadge } from '../components/ui/Badge'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'

const EVALUATION_STEPS = ['Saving your last answer', 'Scoring each answer out of 10', 'Writing feedback and stronger answers', 'Building your study roadmap']
const RETRY_STEPS = ['Picking up where we left off', 'Finishing the interviewer’s work', 'Saving the results']

export function InterviewPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const { data: interview, error, status, loading, reload, setData } = useApi(() => getInterview(id), [id])
  const [busy, setBusy] = useState<'evaluating' | 'retrying' | null>(null)

  const submit = async (answer: string): Promise<boolean> => {
    if (!interview?.next_question) return false
    const isLast = interview.next_question.position === interview.questions.length
    if (isLast) setBusy('evaluating')
    try {
      setData(await submitAnswer(interview.id, { question_id: interview.next_question.id, answer }))
      if (isLast) toast.success('Your feedback is ready.')
      return true
    } catch (err) {
      toast.error(getErrorMessage(err))
      // 502: the answer was saved but evaluation failed. 409: another tab got there first.
      // Either way the server has the truth, so reload it.
      const code = getStatus(err)
      if (code === 502 || code === 409) {
        void reload()
        return true
      }
      return false
    } finally {
      setBusy(null)
    }
  }

  const retry = async () => {
    if (!interview) return
    setBusy('retrying')
    try {
      setData(await retryInterview(interview.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {busy === 'evaluating' && (
        <LoadingScreen title="Evaluating your interview" steps={EVALUATION_STEPS} note="This usually takes 10–20 seconds. Please keep this tab open." />
      )}
      {busy === 'retrying' && <LoadingScreen title="Retrying" steps={RETRY_STEPS} />}

      <Link to="/dashboard/history" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> All interviews
      </Link>

      {loading && !interview ? (
        <InterviewSkeleton />
      ) : error || !interview ? (
        <Card className="mt-4">
          {status === 404 ? (
            <EmptyState
              icon={FileQuestion}
              title="Interview not found"
              description="It may have been removed, or it belongs to another account."
              action={<ButtonLink to="/dashboard/history">Back to your interviews</ButtonLink>}
            />
          ) : (
            <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />
          )}
        </Card>
      ) : (
        <InterviewBody interview={interview} onSubmit={submit} onRetry={retry} retrying={busy === 'retrying'} />
      )}
    </div>
  )
}

function InterviewHeader({ interview }: { interview: Interview }) {
  const answered = interview.questions.filter((q) => q.answer).length
  const total = interview.questions.length || 3
  return (
    <header className="mt-3 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {interview.role} <span className="font-normal text-muted">at</span> {interview.company}
        </h1>
        <StatusBadge status={interview.status} />
      </div>
      {interview.status === 'in_progress' && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>
              {answered} of {total} answered
            </span>
            <span>{Math.round((answered / total) * 100)}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answered}
            aria-label="Interview progress"
          >
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
        </div>
      )}
    </header>
  )
}

function InterviewBody({
  interview,
  onSubmit,
  onRetry,
  retrying,
}: {
  interview: Interview
  onSubmit: (answer: string) => Promise<boolean>
  onRetry: () => void
  retrying: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const next = interview.next_question

  // Bring the newest question into view after each answer.
  useEffect(() => {
    if (next) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [next?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (interview.status === 'completed') {
    return (
      <>
        <InterviewHeader interview={interview} />
        <div className="space-y-6">
          <ScoreSummary interview={interview} />
          <div className="space-y-4">
            {interview.questions.map((q) => (
              <QuestionFeedback key={q.id} question={q} />
            ))}
          </div>
          {interview.roadmap && <RoadmapView roadmap={interview.roadmap} />}
          <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
            <ButtonLink to="/interviews/new" size="lg">
              <Plus aria-hidden className="size-4" /> Practise again
            </ButtonLink>
            <ButtonLink to="/dashboard" size="lg" variant="secondary">
              See your progress
            </ButtonLink>
          </div>
        </div>
      </>
    )
  }

  // In progress, but the AI step failed: questions never generated, or evaluation didn't finish.
  const stuck = interview.questions.length === 0 || !next
  return (
    <>
      <InterviewHeader interview={interview} />
      <div className="space-y-5" aria-live="polite">
        {interview.questions
          .filter((q) => q.answer)
          .map((q) => (
            <div key={q.id} className="space-y-5">
              <InterviewerBubble label={`Question ${q.position}`} topic={q.topic}>
                {q.question}
              </InterviewerBubble>
              <CandidateBubble>{q.answer!.answer_text}</CandidateBubble>
            </div>
          ))}

        {next && (
          <InterviewerBubble
            label={`Question ${next.position} of ${interview.questions.length}`}
            topic={interview.questions.find((q) => q.id === next.id)?.topic}
          >
            {next.question}
          </InterviewerBubble>
        )}

        {stuck && (
          <Card className="border-warn/40 bg-warn-soft/40 p-5" role="alert">
            <div className="flex gap-3">
              <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warn-ink" />
              <div>
                <h2 className="font-semibold text-ink">
                  {interview.questions.length === 0 ? "Your questions aren't ready yet" : 'Your answers are saved'}
                </h2>
                <p className="mt-1 text-sm text-ink-2">
                  {interview.questions.length === 0
                    ? 'The AI interviewer hit a problem while writing your questions.'
                    : "The AI interviewer hit a problem while scoring. Nothing is lost. Retry to finish your feedback."}
                </p>
                <Button className="mt-4" onClick={onRetry} loading={retrying}>
                  <RotateCcw aria-hidden className="size-4" /> Retry
                </Button>
              </div>
            </div>
          </Card>
        )}
        <div ref={bottomRef} />
      </div>

      {next && (
        <div className="mt-6">
          <AnswerComposer
            key={next.id}
            interviewId={interview.id}
            questionId={next.id}
            isLast={next.position === interview.questions.length}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </>
  )
}

function InterviewSkeleton() {
  return (
    <div className="mt-4 space-y-6" aria-busy="true" aria-label="Loading interview">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-2 w-full" />
      <div className="flex gap-3">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-20 flex-1" />
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
