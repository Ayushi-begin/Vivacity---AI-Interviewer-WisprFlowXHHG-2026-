import type { TopicStat } from '../../api/types'

/**
 * Average score per topic (0–10) as horizontal bars: one hue (magnitude), capped
 * thickness, rounded data end, value at the tip in ink. Strong/weak is carried by
 * the section heading (icon + label), not by bar colour.
 */
export function TopicBars({ topics }: { topics: TopicStat[] }) {
  return (
    <ul className="space-y-3.5">
      {topics.map((topic) => {
        const pct = (topic.average_score / 10) * 100
        const label = `${topic.topic}: ${topic.average_score.toFixed(1)} out of 10 across ${topic.answers} answer${topic.answers === 1 ? '' : 's'}`
        return (
          <li key={topic.topic} title={label} aria-label={label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-ink">{topic.topic}</span>
              <span className="shrink-0 text-xs text-muted">
                {topic.answers} answer{topic.answers === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-2.5" aria-hidden>
              <div className="h-3 flex-1">
                <div className="h-3 rounded-r-[4px] bg-accent" style={{ width: `${Math.max(pct, 1.5)}%` }} />
              </div>
              <span className="w-9 text-right text-sm font-semibold text-ink tabular-nums">
                {topic.average_score.toFixed(1)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
