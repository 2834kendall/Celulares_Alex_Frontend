'use client'

import { useState } from 'react'
import { History, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { CollaboratorRow, EvaluationDetail, RubroRow } from '@/modules/evaluations/types'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { EvaluationDetailModal } from './EvaluationDetailModal'
import { ScoreBadge } from './ScoreBadge'

interface EvaluationHistoryProps {
  collaborator: CollaboratorRow
  rubros: RubroRow[]
}

/*
  Tendencia respecto a la evaluacion anterior (el historico viene ordenado
  de la mas reciente a la mas antigua).
 */
function trendOf(history: EvaluationDetail[], index: number) {
  const current = history[index]?.promedio
  const previous = history[index + 1]?.promedio
  if (current == null || previous == null) return null
  const delta = Math.round((current - previous) * 10) / 10
  return delta
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Histórico de evaluaciones
          </h3>
        </div>
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <History className="h-3 w-3" />
          {history.length} evaluación{history.length === 1 ? '' : 'es'} en todo el período activo
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Fecha</th>
              <th className="px-3 py-2 text-left font-semibold">Tipo</th>
              <th className="px-3 py-2 text-left font-semibold">Período evaluado</th>
              <th className="px-3 py-2 text-left font-semibold">Evaluador</th>
              <th className="px-3 py-2 text-left font-semibold">Resultado</th>
              <th className="px-3 py-2 text-center font-semibold">Tendencia</th>
              <th className="px-3 py-2 text-center font-semibold">Promedio</th>
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
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/70"
                >
                  <td className="px-3 py-2 font-semibold tabular-nums text-slate-800">
                    {detail.fecha}
                    {absoluteIndex === 0 && (
                      <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        Vigente
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{detail.tipo}</td>
                  <td className="px-3 py-2 text-slate-600">{detail.periodo}</td>
                  <td className="px-3 py-2 text-slate-600">{detail.evaluador ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{detail.resultado ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {delta === null ? (
                      <span className="text-slate-300">—</span>
                    ) : delta > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-600">
                        <TrendingUp className="h-3 w-3" /> +{delta.toFixed(1)}
                      </span>
                    ) : delta < 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-rose-600">
                        <TrendingDown className="h-3 w-3" /> {delta.toFixed(1)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-slate-400">
                        <Minus className="h-3 w-3" /> 0.0
                      </span>
                    )}
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
