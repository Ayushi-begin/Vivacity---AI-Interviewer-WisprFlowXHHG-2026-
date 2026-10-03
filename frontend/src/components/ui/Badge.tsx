import { CircleAlert, CircleCheck, CircleDot, Clock3, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { InterviewStatus } from '../../api/types'

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good-soft text-good-ink',
  warn: 'bg-warn-soft text-warn-ink',
  bad: 'bg-bad-soft text-bad-ink',
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

/** Score bands. Status colour always comes with an icon and a word, never colour alone. */
export function scoreBand(score: number, max: number) {
  const ratio = score / max
  if (ratio >= 0.7) return { tone: 'good' as const, label: 'Strong', Icon: CircleCheck }
  if (ratio >= 0.5) return { tone: 'warn' as const, label: 'Fair', Icon: TriangleAlert }
  return { tone: 'bad' as const, label: 'Needs work', Icon: CircleAlert }
}

export function ScorePill({ score, max = 10, size = 'md' }: { score: number; max?: number; size?: 'md' | 'lg' }) {
  const { tone, label, Icon } = scoreBand(score, max)
  const big = size === 'lg'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${tones[tone]} ${big ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'}`}
    >
      <Icon aria-hidden className={big ? 'size-4' : 'size-3.5'} />
      <span>
        {score}/{max}
      </span>
      <span className="font-medium opacity-90">· {label}</span>
    </span>
  )
}

export function StatusBadge({ status }: { status: InterviewStatus }) {
  return status === 'completed' ? (
    <Badge tone="good">
      <CircleDot aria-hidden className="size-3" /> Completed
    </Badge>
  ) : (
    <Badge tone="accent">
      <Clock3 aria-hidden className="size-3" /> In progress
    </Badge>
  )
}
