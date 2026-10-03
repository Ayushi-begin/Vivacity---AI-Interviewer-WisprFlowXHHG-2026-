import { ArrowLeft, FileQuestion, Plus, RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { getErrorMessage, getStatus } from '../api/errors'
import { getInterview, retryInterview, submitAnswer } from '../api/interviews'
import type { Interview } from '../api/types'
import { AnswerComposer, CandidateBubble, InterviewerBubble } from '../components/interview/Chat'
import { DeleteInterviewButton } from '../components/interview/DeleteInterviewButton'
import { LoadingScreen } from '../components/interview/LoadingScreen'
import { QuestionFeedback, RoadmapView, ScoreSummary } from '../components/interview/Results'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { StatusBadge } from '../components/ui/Badge'
import { useToast } from '../context/useToast'
import { useApi } from '../hooks/useApi'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const EVALUATION_STEPS = ['Saving your answers', 'Scoring each answer out of 10', 'Writing feedback and stronger answers', 'Building your study roadmap']
const QUESTION_STEPS = ['Reading your resume', 'Matching it to the role', 'Writing your three questions']
// How often to check on scoring that's running on the server.
const POLL_MS = 2000

export function InterviewPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: interview, error, status, loading, reload, setData } = useApi(() => getInterview(id), [id])
  const [retrying, setRetrying] = useState(false)
  const processing = interview?.processing ?? false
  useDocumentTitle(interview ? `${interview.status === 'completed' ? 'Results' : 'Interview'}: ${interview.role} at ${interview.company}` : loading ? 'Loading interview' : 'Interview')

  // Scoring runs on the server after the last answer. Check back until it's done.
  useEffect(() => {
    if (!processing) return
    let active = true
    let timer = 0
    const poll = async () => {
      try {
        const fresh = await getInterview(id)
        if (!active) return
        setData(fresh)
        if (!fresh.processing) {
          if (fresh.status === 'completed') toast.success('Your feedback is ready.')
          else toast.error("The AI interviewer couldn't finish. Your answers are saved, so you can retry.")
          return
        }
      } catch {
        // A blip in the connection: keep checking.
      }
      if (active) timer = window.setTimeout(poll, POLL_MS)
    }
    timer = window.setTimeout(poll, POLL_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [processing, id, setData, toast])

  const submit = async (answer: string): Promise<boolean> => {
    if (!interview?.next_question) return false
    try {
      setData(await submitAnswer(interview.id, { question_id: interview.next_question.id, answer }))
      return true
    } catch (err) {
      toast.error(getErrorMessage(err))
      // 502: the answer was saved but evaluation failed. 409: another tab got there first.
      // Either way the server has the truth, so reload it.
      const code = getStatus(err)
      if (code === 502 || code === 409) {
        reload()
        return true
      }
      return false
    }
  }

  const retry = async () => {
    if (!interview) return
    setRetrying(true)
    try {
      setData(await retryInterview(interview.id))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {interview?.processing &&
        (interview.questions.length === 0 ? (
          <LoadingScreen title="Writing your questions" steps={QUESTION_STEPS} />
        ) : (
          <LoadingScreen
            title="Evaluating your interview"
            steps={EVALUATION_STEPS}
            note="This usually takes 10–20 seconds. You can leave this page: scoring carries on, and your results will be in your history."
            action={
              <ButtonLink to="/dashboard/history" variant="secondary" size="sm">
                Go to your interviews
              </ButtonLink>
            }
          />
        ))}

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
        <InterviewBody
          interview={interview}
          onSubmit={submit}
          onRetry={retry}
          retrying={retrying}
          onDeleted={() => navigate('/dashboard/history', { replace: true })}
        />
      )}
    </div>
  )
}

function InterviewHeader({ interview, onDeleted }: { interview: Interview; onDeleted: () => void }) {
  const answered = interview.questions.filter((q) => q.answer).length
  const total = interview.questions.length || 3
  return (
    <header className="mt-4 mb-8 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {interview.role} <span className="font-normal text-muted">at</span> {interview.company}
          </h1>
          <StatusBadge status={interview.status} />
        </div>
        {!interview.processing && <DeleteInterviewButton interview={interview} onDeleted={onDeleted} />}
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
            className="h-2 overflow-hidden rounded-full bg-accent-soft"
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
  onDeleted,
}: {
  interview: Interview
  onSubmit: (answer: string) => Promise<boolean>
  onRetry: () => void
  retrying: boolean
  onDeleted: () => void
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
        <InterviewHeader interview={interview} onDeleted={onDeleted} />
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
  const stuck = !interview.processing && (interview.questions.length === 0 || !next)
  return (
    <>
      <InterviewHeader interview={interview} onDeleted={onDeleted} />
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
