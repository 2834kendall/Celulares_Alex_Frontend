'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarCheck2, Star, X } from 'lucide-react'
import type { CollaboratorRow, RubroRow } from '@/modules/evaluations/types'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { EvaluationForm } from './EvaluationForm'
import { ScoreBadge } from './ScoreBadge'

interface NewEvaluationSectionProps {
  collaborators: CollaboratorRow[]
  rubros: RubroRow[]
}

export function NewEvaluationSection({ collaborators, rubros }: NewEvaluationSectionProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Deep-link desde la vista individual: ?tab=nueva&colaborador=<labId>
  // abre el formulario con ese colaborador ya seleccionado.
  const paramLabId = Number(searchParams.get('colaborador'))
  const initialLabId = collaborators.some((c) => c.labId === paramLabId) ? paramLabId : undefined

  const [showForm, setShowForm] = useState(initialLabId !== undefined)

  const recentEvaluations = useMemo(
    () =>
      collaborators
        .filter((c) => c.evaluation !== null)
        .sort((a, b) => b.evaluation!.fecha.localeCompare(a.evaluation!.fecha)),
    [collaborators]
  )

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    recentEvaluations,
    8
  )

  function goToIndividual(labId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'individual')
    params.set('colaborador', String(labId))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Nueva evaluación de desempeño</h2>
          <p className="text-xs text-slate-500">
            Registre la evaluación del período indicando el rango de fechas evaluado y la nota de
            cada rubro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          {showForm ? (
            <>
              <X className="h-3.5 w-3.5" /> Cancelar
            </>
          ) : (
            <>
              <Star className="h-3.5 w-3.5" /> Realizar evaluación a colaborador
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">
            Realizar evaluación a colaborador
          </h3>
          <EvaluationForm
            collaborators={collaborators}
            rubros={rubros}
            initialLabId={initialLabId}
            onSuccess={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="h-4 w-1 rounded-full bg-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Últimas evaluaciones registradas
          </h3>
        </div>
        {recentEvaluations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-200">
              <CalendarCheck2 className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500">
              Todavía no se ha registrado ninguna evaluación de desempeño.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Colaborador</th>
                    <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-3 py-2 text-left font-semibold">Período evaluado</th>
                    <th className="px-3 py-2 text-left font-semibold">Evaluador</th>
                    <th className="px-3 py-2 text-center font-semibold">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr
                      key={c.labId}
                      onClick={() => goToIndividual(c.labId)}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">{c.fullName}</p>
                        <p className="text-[11px] text-slate-500">
                          {c.position ?? 'Sin puesto'} • {c.branchName}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{c.evaluation!.tipo}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">
                        {c.evaluation!.fecha}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{c.evaluation!.periodo}</td>
                      <td className="px-3 py-2 text-slate-600">{c.evaluation!.evaluador ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <ScoreBadge score={c.evaluation!.promedio} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </>
        )}
      </div>
    </div>
  )
}
