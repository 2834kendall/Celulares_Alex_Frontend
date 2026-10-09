'use client'

import { useState, type CSSProperties } from 'react'
import { Award, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { MyEvaluationsSummary } from '@/modules/dashboard/lib/extras'
import { classifyScore } from '@/modules/evaluations/lib/scoring'

const MAX_SCORE = 10
/* Circumference of the gauge, so its dash can be given as a share of 100. */
const GAUGE_RADIUS = 15.9155

function scoreLabel(score: number) {
  return score.toLocaleString('es-CR', { maximumFractionDigits: 1 })
}

/**
 * The reader's own evaluations: the latest score as a gauge, how it moved
 * since the one before, and the last few as columns. Pointing at a column
 * shows that evaluation in the gauge. Read-only, and only finished
 * evaluations get here — never a draft.
 */
export function MyEvaluationsWidget({
  summary,
  step,
}: {
  summary: MyEvaluationsSummary
  step?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { evaluations } = summary
  const latest = evaluations[evaluations.length - 1]
  const shown = evaluations.find((evaluation) => evaluation.id === hovered) ?? latest

  return (
    <WidgetCard icon={Award} title="Mis evaluaciones" step={step}>
      {!shown ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Todavía no tenés evaluaciones registradas.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-4">
            {/* Gauge: the score out of 10. The number is written inside, so
                the arc is never the only way to read it. */}
            <div className="relative h-20 w-20 shrink-0">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                  cx={18}
                  cy={18}
                  r={GAUGE_RADIUS}
                  fill="none"
                  className="stroke-brand-100"
                  strokeWidth={3.2}
                />
                <circle
                  cx={18}
                  cy={18}
                  r={GAUGE_RADIUS}
                  fill="none"
                  className="dash-gauge stroke-brand-600"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeDasharray="100 100"
                  strokeDashoffset={100 - (shown.promedio / MAX_SCORE) * 100}
                />
              </svg>
              <p className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-xl font-black tracking-tight text-slate-900 tabular-nums">
                  {scoreLabel(shown.promedio)}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold text-slate-400">de 10</span>
              </p>
            </div>

            <div className="min-w-0">
              <Badge tone={classifyScore(shown.promedio).tone}>
                {classifyScore(shown.promedio).label}
              </Badge>
              <p className="mt-1.5 truncate text-xs text-slate-500">
                {shown.periodo} · {shown.fecha}
              </p>
              {shown.id === latest.id && summary.delta !== null && summary.delta !== 0 && (
                <p
                  className={cn(
                    'mt-1 inline-flex items-center gap-1 text-xs font-semibold',
                    summary.delta > 0 ? 'text-emerald-700' : 'text-rose-700'
                  )}
                >
                  {summary.delta > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {summary.delta > 0 ? '+' : '−'}
                  {scoreLabel(Math.abs(summary.delta))} respecto a la anterior
                </p>
              )}
            </div>
          </div>

          {evaluations.length > 1 && (
            <ol
              className="mt-4 flex h-20 items-end gap-1.5 border-t border-slate-100 pt-3"
              onPointerLeave={() => setHovered(null)}
            >
              {evaluations.map((evaluation, index) => {
                const isShown = evaluation.id === shown.id
                return (
                  <li
                    key={evaluation.id}
                    onPointerEnter={() => setHovered(evaluation.id)}
                    className={cn(
                      'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-lg px-0.5 transition duration-200',
                      hovered !== null && !isShown && 'opacity-50'
                    )}
                  >
                    <span className="flex min-h-0 w-full flex-1 items-end justify-center">
                      <span
                        className={cn(
                          'dash-column block w-full max-w-8 rounded-md transition-colors duration-200',
                          isShown ? 'bg-brand-600' : 'bg-brand-200'
                        )}
                        style={
                          {
                            height: `${Math.max(8, (evaluation.promedio / MAX_SCORE) * 100)}%`,
                            '--i': index,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span
                      className={cn(
                        'w-full truncate text-center text-[10px] tabular-nums',
                        isShown ? 'font-bold text-slate-900' : 'text-slate-400'
                      )}
                    >
                      {evaluation.fechaCorta}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
    </WidgetCard>
  )
}
