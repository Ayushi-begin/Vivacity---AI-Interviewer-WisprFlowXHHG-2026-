import { BookOpen, CheckCircle2, ChevronDown, Clock, Flag, Lightbulb, MinusCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { Interview, Question, Roadmap, RoadmapItem } from '../../api/types'
import { Badge, ScorePill } from '../ui/Badge'
import { scoreBand } from '../ui/scoreBand'
import { Card } from '../ui/Card'

/** Meter: accent fill on a lighter track of the same hue; the number carries the value. */
function ScoreRing({ value, max }: { value: number; max: number }) {
  const size = 132
  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-soft)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value / max)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  )
}

export function ScoreSummary({ interview }: { interview: Interview }) {
  const total = interview.total_score ?? 0
  const percent = Math.round((total / interview.max_score) * 100)
  const { label, Icon } = scoreBand(total, interview.max_score)
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-8 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
        <div className="flex items-center gap-5">
          <div className="relative flex shrink-0 items-center justify-center">
            <ScoreRing value={total} max={interview.max_score} />
            <p className="absolute text-center">
              <span className="block text-4xl font-semibold tracking-tight text-ink tabular-nums">{total}</span>
              <span className="text-sm font-medium text-muted">of {interview.max_score}</span>
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted">Overall score</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{percent}%</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2">
              <Icon aria-hidden className="size-4" /> {label}
            </p>
            <p className="sr-only">
              {total} out of {interview.max_score}
            </p>
          </div>
        </div>
        <ul className="space-y-3" aria-label="Score per question">
          {interview.questions.map((q) => (
            <li key={q.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink-2">
                  Q{q.position} · {q.topic ?? 'General'}
                </span>
                <span className="font-semibold text-ink tabular-nums">{q.answer?.score ?? '–'}/10</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${((q.answer?.score ?? 0) / 10) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function FeedbackBlock({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof Sparkles
  title: string
  tone: 'good' | 'bad' | 'accent'
  children: string | null
}) {
  const color = { good: 'text-good-ink', bad: 'text-bad-ink', accent: 'text-accent-ink' }[tone]
  return (
    <div>
      <h4 className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
        <Icon aria-hidden className="size-4" /> {title}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">{children || '—'}</p>
    </div>
  )
}

export function QuestionFeedback({ question }: { question: Question }) {
  const [showAnswer, setShowAnswer] = useState(false)
  const [showBetter, setShowBetter] = useState(false)
  const answer = question.answer

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">QUESTION {question.position}</span>
        {question.topic && <Badge tone="accent">{question.topic}</Badge>}
        <span className="ml-auto">{answer?.score != null && <ScorePill score={answer.score} />}</span>
      </div>
      <h3 className="mt-3 text-base leading-snug font-semibold text-ink">{question.question}</h3>
      {question.what_it_tests && <p className="mt-1.5 text-sm text-muted">Tests: {question.what_it_tests}</p>}

      <button
        type="button"
        onClick={() => setShowAnswer((v) => !v)}
        aria-expanded={showAnswer}
        className="mt-4 flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline"
      >
        <ChevronDown aria-hidden className={`size-4 transition-transform ${showAnswer ? 'rotate-180' : ''}`} />
        {showAnswer ? 'Hide your answer' : 'Show your answer'}
      </button>
      {showAnswer && (
        <p className="mt-2 rounded-xl bg-surface-2 p-3.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
          {answer?.answer_text}
        </p>
      )}

      <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-2">
        <FeedbackBlock icon={CheckCircle2} title="What was good" tone="good">
          {answer?.what_was_good ?? null}
        </FeedbackBlock>
        <FeedbackBlock icon={MinusCircle} title="What was missing" tone="bad">
          {answer?.what_was_missing ?? null}
        </FeedbackBlock>
      </div>

      {answer?.better_answer && (
        <div className="mt-5 rounded-xl border border-line bg-surface-2/60">
          <button
            type="button"
            onClick={() => setShowBetter((v) => !v)}
            aria-expanded={showBetter}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-ink"
          >
            <Lightbulb aria-hidden className="size-4 text-accent-ink" />
            A stronger answer
            <ChevronDown aria-hidden className={`ml-auto size-4 text-muted transition-transform ${showBetter ? 'rotate-180' : ''}`} />
          </button>
          {showBetter && (
            <p className="border-t border-line px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
              {answer.better_answer}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

const PRIORITY: Record<RoadmapItem['priority'], { tone: 'bad' | 'warn' | 'neutral'; label: string }> = {
  high: { tone: 'bad', label: 'High priority' },
  medium: { tone: 'warn', label: 'Medium priority' },
  low: { tone: 'neutral', label: 'Low priority' },
}

export function RoadmapView({ roadmap }: { roadmap: Roadmap }) {
  const totalHours = roadmap.items.reduce((sum, item) => sum + item.estimated_hours, 0)
  return (
    <section aria-labelledby="roadmap-title" className="space-y-4">
      <div>
        <h2 id="roadmap-title" className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Flag aria-hidden className="size-5 text-accent" /> Your study roadmap
        </h2>
        {roadmap.summary && <p className="mt-1.5 text-ink-2">{roadmap.summary}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-4" /> About {totalHours} hours total
          </span>
          {roadmap.weak_areas.length > 0 && <span aria-hidden>·</span>}
          {roadmap.weak_areas.map((area) => (
            <Badge key={area}>{area}</Badge>
          ))}
        </div>
      </div>

      <ol className="grid gap-4 md:grid-cols-2">
        {roadmap.items.map((item, index) => {
          const priority = PRIORITY[item.priority]
          return (
            <li key={`${item.topic}-${index}`}>
              <Card className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-ink">
                    <span className="mr-1.5 text-muted tabular-nums">{index + 1}.</span>
                    {item.topic}
                  </h3>
                  <Badge tone={priority.tone} className="shrink-0">
                    {priority.label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-ink-2">{item.why}</p>
                <ul className="mt-4 space-y-2">
                  {item.study_steps.map((step) => (
                    <li key={step} className="flex gap-2 text-sm text-ink">
                      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
                {item.resources.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase">
                      <BookOpen aria-hidden className="size-3.5" /> Resources
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
                      {item.resources.map((resource) => (
                        <li key={resource}>{resource}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-4 flex items-center gap-1 text-xs text-muted">
                  <Clock aria-hidden className="size-3.5" /> ~{item.estimated_hours} hours
                </p>
              </Card>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
