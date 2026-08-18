'use client'

import { useState } from 'react'
import { History, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { CollaboratorRow, EvaluationDetail, RubroRow } from '@/modules/evaluations/types'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { EvaluationDetailModal } from './EvaluationDetailModal'
import { ScoreBadge } from './ScoreBadge'
import { cn } from '@/lib/utils/cn'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
  TABLE_TH,
  TABLE_TH_CENTER,
  TABLE_WRAP,
} from '@/components/ui/styles'

interface EvaluationHistoryProps {
  collaborator: CollaboratorRow
  rubros: RubroRow[]
}

function trendOf(history: EvaluationDetail[], index: number) {
  const current = history[index]?.promedio
  const previous = history[index + 1]?.promedio
  if (current == null || previous == null) return null
  return Math.round(current) - Math.round(previous)
}

/**
 * Variacion contra la evaluacion anterior. Lo rinden las dos vistas —
 * tarjetas en movil y tabla — asi que vive aparte para no duplicar las tres
 * ramas de signo.
 */
function Tendencia({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-slate-300">—</span>

  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-600">
        <TrendingUp className="h-3 w-3" /> +{delta}
      </span>
    )
  }

  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-rose-600">
        <TrendingDown className="h-3 w-3" /> {delta}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-slate-400">
      <Minus className="h-3 w-3" /> 0
    </span>
  )
}

export function EvaluationHistory({ collaborator, rubros }: EvaluationHistoryProps) {
  const [selected, setSelected] = useState<EvaluationDetail | null>(null)

  const { history } = collaborator
  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    history,
    8
  )

  if (history.length === 0) {
    return null
  }

  return (
    <div className={cn('@container', TABLE_WRAP)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-brand-600" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Histórico de evaluaciones
          </h3>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <History className="h-3 w-3" />
          {history.length} evaluación{history.length === 1 ? '' : 'es'} en todo el período activo
        </p>
      </div>

      {/*
        Movil: una tarjeta por evaluacion. La tabla tiene 7 columnas y la fila
        entera abre el detalle — en 375px eso era scroll a ciegas sobre un
        control invisible.
      */}
      <ul className="space-y-3 p-3 @3xl:hidden">
        {paginatedItems.map((detail, i) => {
          const absoluteIndex = (page - 1) * 8 + i
          const delta = trendOf(history, absoluteIndex)

          return (
            <li key={detail.id}>
              <button
                type="button"
                onClick={() => setSelected(detail)}
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className="animate-fade-in block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.99] motion-reduce:active:scale-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-slate-800">
                      {detail.fecha}
                      {absoluteIndex === 0 && (
                        <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          Vigente
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{detail.tipo}</p>
                  </div>
                  {/*
                    Nota y tendencia juntas arriba a la derecha: son las dos
                    cosas que se vienen a mirar, y separarlas obligaba a leer
                    la tarjeta entera para saber si mejoro o empeoro.
                  */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ScoreBadge score={detail.promedio} />
                    <Tendencia delta={delta} />
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                  {[
                    { label: 'Período', valor: detail.periodo },
                    { label: 'Evaluador', valor: detail.evaluador ?? '—' },
                    { label: 'Resultado', valor: detail.resultado ?? '—' },
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 break-words text-xs text-slate-600">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="hidden @3xl:block @3xl:overflow-x-auto">
        <table className="w-full text-xs">
          <thead className={TABLE_HEAD}>
            <tr>
              <th className={TABLE_TH}>Fecha</th>
              <th className={TABLE_TH}>Tipo</th>
              <th className={TABLE_TH}>Período evaluado</th>
              <th className={TABLE_TH}>Evaluador</th>
              <th className={TABLE_TH}>Resultado</th>
              <th className={TABLE_TH_CENTER}>Tendencia</th>
              <th className={TABLE_TH_CENTER}>Promedio</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((detail, i) => {
              // Indice absoluto dentro del historico para calcular la tendencia.
              const absoluteIndex = (page - 1) * 8 + i
              const delta = trendOf(history, absoluteIndex)
              return (
                <tr
                  key={detail.id}
                  onClick={() => setSelected(detail)}
                  className={TABLE_ROW_CLICKABLE}
                >
                  <td className="px-3 py-2 font-semibold tabular-nums text-slate-800">
                    {detail.fecha}
                    {absoluteIndex === 0 && (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        Vigente
                      </span>
                    )}
                  </td>
                  <td className={TABLE_TD}>{detail.tipo}</td>
                  <td className={TABLE_TD}>{detail.periodo}</td>
                  <td className={TABLE_TD}>{detail.evaluador ?? '—'}</td>
                  <td className={TABLE_TD}>{detail.resultado ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <Tendencia delta={delta} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ScoreBadge score={detail.promedio} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPrevious={goToPreviousPage}
        onNext={goToNextPage}
      />

      {selected && (
        <EvaluationDetailModal
          collaboratorName={collaborator.fullName}
          detail={selected}
          rubros={rubros}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
