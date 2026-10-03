import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ScorePoint } from '../../api/types'

const HEIGHT = 240
const PAD = { top: 16, right: 44, bottom: 30, left: 44 }
const Y_TICKS = [0, 25, 50, 75, 100]

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const fullDateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Score over time: one series (total score as % of the maximum), one point per
 * completed interview in order. Single series, so no legend box: the card title names it.
 */
export function ScoreChart({ points }: { points: ScorePoint[] }) {
  const [containerRef, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const innerW = Math.max(width - PAD.left - PAD.right, 1)
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = (pct: number) => PAD.top + innerH - (pct / 100) * innerH
    const coords = points.map((p, i) => ({ x: x(i), y: y(p.percentage) }))
    const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join(' ')
    const baseline = y(0)
    const area = coords.length > 1 ? `${line} L${coords.at(-1)!.x},${baseline} L${coords[0]!.x},${baseline} Z` : ''
    // Thin out x labels so they never collide (about 70px each).
    const maxLabels = Math.max(2, Math.floor(innerW / 70))
    const step = Math.max(1, Math.ceil(points.length / maxLabels))
    const xLabels = points
      .map((p, i) => ({ i, text: dateFmt.format(new Date(p.completed_at)) }))
      .filter(({ i }) => i % step === 0 || i === points.length - 1)
      .filter((label, idx, all) => idx === all.length - 1 || all[all.length - 1]!.i - label.i >= step)
    return { coords, line, area, y, baseline, xLabels, innerW }
  }, [points, width])

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left + PAD.left
    let nearest = 0
    geometry.coords.forEach((c, i) => {
      if (Math.abs(c.x - px) < Math.abs(geometry.coords[nearest]!.x - px)) nearest = i
    })
    setActive(nearest)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    setActive((current) => {
      const from = current ?? (event.key === 'ArrowRight' ? -1 : points.length)
      return Math.min(points.length - 1, Math.max(0, from + (event.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const last = points.length - 1
  const activePoint = active != null ? points[active] : null
  const activeCoord = active != null ? geometry.coords[active] : null
  const tooltipLeft = activeCoord ? Math.min(Math.max(activeCoord.x, 90), width - 90) : 0

  return (
    <div ref={containerRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Score over time across ${points.length} interviews. Latest ${points[last]?.percentage}%.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block overflow-visible rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {/* Recessive hairline grid + y labels */}
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={geometry.y(tick)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {tick}%
              </text>
            </g>
          ))}
          {geometry.xLabels.map(({ i, text }) => (
            <text key={i} x={geometry.coords[i]!.x} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {text}
            </text>
          ))}

          {geometry.area && <path d={geometry.area} fill="var(--accent)" opacity={0.1} />}
          {points.length > 1 && (
            <path d={geometry.line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {activeCoord && (
            <line x1={activeCoord.x} x2={activeCoord.x} y1={PAD.top} y2={geometry.baseline} stroke="var(--line)" strokeWidth={1} />
          )}

          {/* Markers carry a 2px surface ring so they stay legible on the line. */}
          {geometry.coords.map((c, i) => (
            <circle
              key={points[i]!.interview_id}
              cx={c.x}
              cy={c.y}
              r={i === active ? 6 : 4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}

          {/* Direct label on the latest point only. Text uses ink, not the series colour. */}
          {geometry.coords[last] && (
            <text
              x={geometry.coords[last].x + 10}
              y={geometry.coords[last].y}
              dy="0.32em"
              className="fill-ink text-xs font-semibold tabular-nums"
            >
              {points[last]!.percentage}%
            </text>
          )}

          {/* Hit area larger than the marks: hover, tap and drag all work. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={geometry.innerW}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
            style={{ touchAction: 'pan-y' }}
          />
        </svg>
      )}

      {activePoint && activeCoord && (
        <div
          className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-overlay"
          style={{ left: tooltipLeft, top: Math.max(activeCoord.y - 86, 0) }}
          role="status"
        >
          <p className="font-medium text-ink">{fullDateFmt.format(new Date(activePoint.completed_at))}</p>
          <p className="mt-0.5 truncate text-muted">
            {activePoint.role} · {activePoint.company}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-ink">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            <span className="font-semibold tabular-nums">{activePoint.total_score}/30</span>
            <span className="text-muted tabular-nums">({activePoint.percentage}%)</span>
          </p>
        </div>
      )}
    </div>
  )
}

/** The same data as a table: the accessible, exact-value view of the chart. */
export function ScoreTable({ points }: { points: ScorePoint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-4 font-medium">Date</th>
            <th scope="col" className="py-2 pr-4 font-medium">Interview</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Score</th>
            <th scope="col" className="py-2 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.interview_id} className="border-b border-line last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-ink-2">{fullDateFmt.format(new Date(p.completed_at))}</td>
              <td className="py-2 pr-4 text-ink">
                {p.role} · {p.company}
              </td>
              <td className="py-2 pr-4 text-right text-ink tabular-nums">{p.total_score}/30</td>
              <td className="py-2 text-right text-ink-2 tabular-nums">{p.percentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
