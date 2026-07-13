'use client'

import { scoreBarColor } from '@/modules/evaluations/lib/scoring'

interface ScoreBarProps {
  label: string
  detail?: string | null
  score: number | null
}

/** Fila nombre + barra de progreso 0-10 usada en el grafico comparativo y los criterios. */
export function ScoreBar({ label, detail, score }: ScoreBarProps) {
  const hasScore = score !== null
  const width = hasScore ? Math.min(100, Math.max(0, (score / 10) * 100)) : 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-semibold text-slate-800">
          {label}
          {detail && <span className="ml-1.5 font-normal text-slate-400">({detail})</span>}
        </p>
        <p className="shrink-0 text-xs font-bold tabular-nums text-slate-900">
          {hasScore ? `${score}/10` : 'Sin evaluar'}
        </p>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={hasScore ? score : undefined}
        aria-label={label}
      >
        {hasScore && (
          <div
            className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
            style={{ width: `${width}%` }}
          />
        )}
      </div>
    </div>
  )
}
