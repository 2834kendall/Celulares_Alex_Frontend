'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarCheck2, Star, X } from 'lucide-react'
import type { CollaboratorRow, RubroRow } from '@/modules/evaluations/types'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { EvaluationForm } from './EvaluationForm'
import { ScoreBadge } from './ScoreBadge'
import { Button } from '@/components/ui/Button'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TH,
  TABLE_TH_CENTER,
  TABLE_WRAP,
} from '@/components/ui/styles'

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
    // Se mide el contenedor y no el viewport: el sidebar ocupa 256px y ademas
    // se colapsa, asi que a un mismo ancho de pantalla el espacio real cambia.
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Nueva evaluación de desempeño</h2>
          <p className="text-xs text-slate-500">
            Registre la evaluación del período indicando el rango de fechas evaluado y la nota de
            cada rubro.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="shrink-0">
          {showForm ? (
            <>
              <X className="h-3.5 w-3.5" /> Cancelar
            </>
          ) : (
            <>
              <Star className="h-3.5 w-3.5" /> Realizar evaluación a colaborador
            </>
          )}
        </Button>
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

      <div className={TABLE_WRAP}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="h-4 w-1 rounded-full bg-brand-600" />
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
            {/*
              Movil: tarjeta por colaborador evaluado. Seis columnas y la
              fila entera abriendo el detalle no funcionan en 375px.
            */}
            <ul className="space-y-3 p-3 @3xl:hidden">
              {paginatedItems.map((c, i) => (
                <li key={c.labId}>
                  <button
                    type="button"
                    onClick={() => goToIndividual(c.labId)}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    className="animate-fade-in block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.99] motion-reduce:active:scale-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-800">
                          {c.fullName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {c.position ?? 'Sin puesto'} • {c.branchName}
                        </p>
                      </div>
                      <ScoreBadge score={c.evaluation!.promedio} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                      {[
                        { label: 'Tipo', valor: c.evaluation!.tipo },
                        { label: 'Fecha', valor: c.evaluation!.fecha },
                        { label: 'Período', valor: c.evaluation!.periodo },
                        { label: 'Evaluador', valor: c.evaluation!.evaluador ?? '—' },
                      ].map(({ label, valor }) => (
                        <div key={label} className="min-w-0">
                          <dt className={META_LABEL}>{label}</dt>
                          <dd className="mt-0.5 break-words text-xs text-slate-600">{valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden @3xl:block @3xl:overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className={TABLE_TH}>Colaborador</th>
                    <th className={TABLE_TH}>Tipo</th>
                    <th className={TABLE_TH}>Fecha</th>
                    <th className={TABLE_TH}>Período evaluado</th>
                    <th className={TABLE_TH}>Evaluador</th>
                    <th className={TABLE_TH_CENTER}>Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr
                      key={c.labId}
                      onClick={() => goToIndividual(c.labId)}
                      className={TABLE_ROW_CLICKABLE}
                    >
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">{c.fullName}</p>
                        <p className="text-[11px] text-slate-500">
                          {c.position ?? 'Sin puesto'} • {c.branchName}
                        </p>
                      </td>
                      <td className={TABLE_TD}>{c.evaluation!.tipo}</td>
                      <td className={TABLE_TD_NUM}>{c.evaluation!.fecha}</td>
                      <td className={TABLE_TD}>{c.evaluation!.periodo}</td>
                      <td className={TABLE_TD}>{c.evaluation!.evaluador ?? '—'}</td>
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
