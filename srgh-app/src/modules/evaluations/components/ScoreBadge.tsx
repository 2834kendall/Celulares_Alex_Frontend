'use client'

import { classifyScore } from '@/modules/evaluations/lib/scoring'

const TONE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  orange: 'bg-orange-50 text-orange-700',
  rose: 'bg-rose-50 text-rose-700',
}

interface ScoreBadgeProps {
  score: number | null
}

// Pastilla con el promedio 0-10 coloreada segun la escala cualitativa.
export function ScoreBadge({ score }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        Sin evaluar
      </span>
    )
  }

  const tone = TONE_CLASSES[classifyScore(score).tone]

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
    >
      {Math.round(score)}/10
    </span>
  )
}
