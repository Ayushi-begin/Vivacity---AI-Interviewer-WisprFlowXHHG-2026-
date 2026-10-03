import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'

/** Score bands. Status colour always comes with an icon and a word, never colour alone. */
export function scoreBand(score: number, max: number) {
  const ratio = score / max
  if (ratio >= 0.7) return { tone: 'good' as const, label: 'Strong', Icon: CircleCheck }
  if (ratio >= 0.5) return { tone: 'warn' as const, label: 'Fair', Icon: TriangleAlert }
  return { tone: 'bad' as const, label: 'Needs work', Icon: CircleAlert }
}
