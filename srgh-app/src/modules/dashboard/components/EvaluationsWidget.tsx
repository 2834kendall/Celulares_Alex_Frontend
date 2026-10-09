'use client'

import type { CSSProperties } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { CountUp } from '@/modules/dashboard/components/CountUp'
import { WidgetCard } from '@/modules/dashboard/components/WidgetCard'
import type { EvaluationsSummary } from '@/modules/dashboard/lib/extras'
import { classifyScore } from '@/modules/evaluations/lib/scoring'

function namesLabel(names: string[], total: number) {
  const rest = total - names.length
  return rest > 0 ? `${names.join(', ')} y ${rest} más` : names.join(', ')
}

export function EvaluationsWidget({
  summary,
  step,
}: {
  summary: EvaluationsSummary
  step?: number
}) {
  const total = summary.evaluated + summary.pending
  const progress = total === 0 ? 0 : Math.round((summary.evaluated / total) * 100)
  /* Same classification the Evaluations module gives a score (A to E). */
  const classification = summary.average === null ? null : classifyScore(summary.average)

  return (
    <WidgetCard icon={ClipboardCheck} title="Evaluaciones" href="/evaluations" step={step}>
      {total === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          No hay colaboradores con contrato vigente para evaluar.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-3xl leading-none font-black tracking-tight text-slate-900 tabular-nums">
              {summary.average === null ? '—' : summary.average.toLocaleString('es-CR')}
              <span className="text-lg font-bold text-slate-400"> / 10</span>
            </p>
            {classification && <Badge tone={classification.tone}>{classification.label}</Badge>}
            <p className="w-full text-sm text-slate-500">promedio de {summary.year}</p>
          </div>

          {/* Meter: how much of the roster has been evaluated this year.
              Track and fill come from the same ramp. */}
          <div className="group/meter mt-4">
            <div className="flex items-baseline justify-between text-xs text-slate-500">
              <span>
                <span className="font-bold text-slate-900">
                  <CountUp value={summary.evaluated} />
                </span>{' '}
                de {total} evaluados
              </span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <div
              className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-brand-100 transition-[height] duration-200 group-hover/meter:h-3.5"
              role="meter"
              aria-label="Colaboradores evaluados este año"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="dash-meter dash-meter-shine h-full rounded-full bg-brand-600"
                style={{ width: `${progress}%` } as CSSProperties}
              />
            </div>
          </div>

          {summary.pending > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Faltan:</span>{' '}
              {namesLabel(summary.pendingNames, summary.pending)}
            </p>
          )}

          {summary.recent.length > 0 && (
            <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
              {summary.recent.map((evaluation) => (
                <li
                  key={evaluation.id}
                  className="dash-line group flex items-center gap-2 rounded-xl px-2 py-1.5 transition duration-200 hover:bg-slate-50"
                >
                  <Avatar
                    nombre={evaluation.nombre}
                    size="xs"
                    className="transition-transform duration-300 group-hover:scale-110"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                    {evaluation.nombre}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">{evaluation.fecha}</span>
                  <span className="w-8 shrink-0 text-right text-sm font-bold text-slate-900 tabular-nums">
                    {evaluation.promedio ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </WidgetCard>
  )
}
