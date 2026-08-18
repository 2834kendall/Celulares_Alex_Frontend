'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  UserRoundCheck,
  UserRound,
} from 'lucide-react'
import type { BranchOption, CollaboratorRow, RubroRow } from '@/modules/evaluations/types'
import { averageScore, LOW_PERFORMANCE_THRESHOLD } from '@/modules/evaluations/lib/scoring'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { CollaboratorListModal } from './CollaboratorListModal'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { ScoreBadge } from './ScoreBadge'
import { ScoreBar } from './ScoreBar'
import { ScoreCell } from './ScoreCell'
import { CARD, META_LABEL, TABLE_HEAD, TABLE_WRAP } from '@/components/ui/styles'

type OpenModal = 'promedios' | 'pendientes' | 'bajo' | null

interface BranchMetricsProps {
  collaborators: CollaboratorRow[]
  branches: BranchOption[]
  rubros: RubroRow[]
}

export function BranchMetrics({ collaborators, branches, rubros }: BranchMetricsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [branchId, setBranchId] = useState<number | 'all'>('all')
  const [openModal, setOpenModal] = useState<OpenModal>(null)
  const [showChart, setShowChart] = useState(false)

  const filtered = useMemo(
    () =>
      branchId === 'all' ? collaborators : collaborators.filter((c) => c.branchId === branchId),
    [collaborators, branchId]
  )

  const evaluated = useMemo(
    () => filtered.filter((c) => c.evaluation !== null && c.evaluation.promedio !== null),
    [filtered]
  )
  const pending = useMemo(() => filtered.filter((c) => c.evaluation === null), [filtered])
  const lowPerformers = useMemo(
    () =>
      evaluated
        .filter((c) => c.evaluation!.promedio! < LOW_PERFORMANCE_THRESHOLD)
        .sort((a, b) => a.evaluation!.promedio! - b.evaluation!.promedio!),
    [evaluated]
  )

  const branchAverage = averageScore(evaluated.map((c) => c.evaluation!.promedio!))
  const bestRated = useMemo(
    () =>
      evaluated.reduce<CollaboratorRow | null>(
        (best, c) =>
          best === null || c.evaluation!.promedio! > best.evaluation!.promedio! ? c : best,
        null
      ),
    [evaluated]
  )
  const coverage =
    filtered.length === 0 ? 0 : Math.round((evaluated.length / filtered.length) * 100)

  const branchAverages = useMemo(
    () =>
      branches.map((b) => {
        const scores = collaborators
          .filter((c) => c.branchId === b.id && c.evaluation?.promedio !== null && c.evaluation)
          .map((c) => c.evaluation!.promedio!)
        return {
          ...b,
          total: collaborators.filter((c) => c.branchId === b.id).length,
          promedio: averageScore(scores),
        }
      }),
    [branches, collaborators]
  )

  const chart = usePagination(evaluated, 8)
  const table = usePagination(filtered, 8)

  function goToIndividual(labId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'individual')
    params.set('colaborador', String(labId))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-sm font-bold text-slate-900">Métricas de la sucursal</h2>
          <p className="text-xs text-slate-500">
            Indicadores del período vigente según la última evaluación de cada colaborador.
          </p>
        </div>
        {/*
          Etiqueta arriba en vez de "Sucursal: [caja]" en linea: ese patron,
          con el SearchSelect en su ancho por defecto (w-56), es lo que
          empujaba el filtro a su propia fila descuadrada en un celular.
        */}
        <label className="block w-full @sm:w-52">
          <span className={META_LABEL}>Sucursal</span>
          <SearchSelect
            ariaLabel="Buscar sucursal"
            className="mt-1 w-full"
            value={branchId === 'all' ? 'all' : String(branchId)}
            onChange={(v) => setBranchId(v === 'all' ? 'all' : Number(v))}
            options={[
              { value: 'all', label: 'Todas las sucursales' },
              ...branches.map((b) => ({ value: String(b.id), label: b.name })),
            ]}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setOpenModal('promedios')}
          className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-brand-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className={META_LABEL}>Promedio de la sucursal</p>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Award className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
            {branchAverage !== null ? `${branchAverage}/10` : '—'}
            <span className="ml-1.5 text-xs font-semibold text-emerald-600">
              {branchId === 'all' ? 'Global' : 'Sucursal'}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            Calificación promedio total de ventas y soporte.
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </p>
        </button>

        <button
          type="button"
          onClick={() => bestRated && goToIndividual(bestRated.labId)}
          disabled={!bestRated}
          className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-brand-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-slate-200"
        >
          <div className="flex items-center justify-between gap-2">
            <p className={META_LABEL}>Mejor calificado</p>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserRoundCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-bold text-slate-900">
            {bestRated
              ? `${bestRated.fullName} (${Math.round(bestRated.evaluation!.promedio!)}/10)`
              : 'Sin evaluaciones'}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            Colaborador estrella de este período oficial.
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </p>
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('pendientes')}
          className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-brand-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className={META_LABEL}>Índice evaluación</p>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
            {coverage}%{' '}
            <span className="text-xs font-semibold text-brand-600">
              {evaluated.length} de {filtered.length}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            Colaboradores de la planilla evaluados.
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
          </p>
        </button>

        <button
          type="button"
          onClick={() => setOpenModal('bajo')}
          className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-rose-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-rose-500/60 focus-visible:ring-offset-2"
        >
          <div className="flex items-center justify-between gap-2">
            <p className={META_LABEL}>Bajo rendimiento-plan</p>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1.5 text-base font-bold tabular-nums text-slate-900">
            {lowPerformers.length}{' '}
            <span
              className={`text-xs font-semibold ${lowPerformers.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
            >
              {lowPerformers.length > 0 ? 'Crítico' : 'Sin casos'}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            Colaboradores con rendimiento menor a {LOW_PERFORMANCE_THRESHOLD} / 10.
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-rose-500" />
          </p>
        </button>
      </div>

      <div className={CARD}>
        <button
          type="button"
          onClick={() => setShowChart((v) => !v)}
          aria-expanded={showChart}
          aria-controls="comparative-chart-panel"
          className={`flex w-full items-center gap-2 px-4 py-3 text-left outline-none transition hover:bg-slate-50/70 focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
            showChart ? 'border-b border-slate-100' : ''
          }`}
        >
          <span className="h-4 w-1 rounded-full bg-brand-600" />
          <h3 className="flex-1 text-xs font-bold uppercase tracking-wide text-slate-900">
            Gráfico comparativo de desempeño
          </h3>
          <span className="text-[11px] font-semibold text-slate-400">
            {showChart ? 'Ocultar' : 'Mostrar'}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showChart ? 'rotate-180' : ''}`}
          />
        </button>
        {showChart && (
          <div id="comparative-chart-panel">
            {evaluated.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-200">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <p className="text-xs text-slate-500">
                  Aún no hay colaboradores evaluados para comparar en esta sucursal.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 p-4">
                  {chart.paginatedItems.map((c) => (
                    <ScoreBar
                      key={c.labId}
                      label={c.fullName}
                      detail={c.position}
                      score={c.evaluation!.promedio}
                    />
                  ))}
                </div>
                <Pagination
                  page={chart.page}
                  totalPages={chart.totalPages}
                  onPrevious={chart.goToPreviousPage}
                  onNext={chart.goToNextPage}
                />
              </>
            )}
          </div>
        )}
      </div>

      <div className={TABLE_WRAP}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 px-4 py-3">
          <span className="h-4 w-1 rounded-full bg-brand-600" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Tabla general de calificaciones
          </h3>
          <p className="ml-auto text-[10px] font-medium text-slate-400">Escala 0–10</p>
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-200">
              <UserRound className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500">No hay colaboradores activos en esta sucursal.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className="sticky left-0 z-10 border-r border-slate-100 bg-slate-50 px-3 py-2 text-left align-bottom font-semibold">
                      Colaborador
                    </th>
                    {rubros.map((r) => (
                      <th
                        key={r.areaId}
                        className="px-3 py-2 text-center align-bottom font-semibold"
                      >
                        <span
                          className="mx-auto block w-[6.5rem] break-words leading-tight"
                          title={r.descripcion}
                        >
                          {r.nombre}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center align-bottom font-semibold">Promedio</th>
                    <th className="px-3 py-2 text-right align-bottom font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {table.paginatedItems.map((c) => (
                    <tr
                      key={c.labId}
                      onClick={() => goToIndividual(c.labId)}
                      className="group cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/70"
                    >
                      <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2 transition group-hover:bg-slate-50">
                        <p className="font-semibold text-slate-800">{c.fullName}</p>
                        <p className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                          <span className="truncate">
                            {c.position ?? 'Sin puesto'} • {c.branchName}
                          </span>
                        </p>
                      </td>
                      {rubros.map((r) => (
                        <ScoreCell
                          key={r.areaId}
                          label={r.nombre}
                          score={
                            r.criterioId !== null ? c.evaluation?.scores[r.criterioId] : undefined
                          }
                        />
                      ))}
                      <td className="px-3 py-2 text-center">
                        <ScoreBadge score={c.evaluation?.promedio ?? null} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            goToIndividual(c.labId)
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition hover:border-brand-300 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-1"
                        >
                          Ver evaluaciones
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={table.page}
              totalPages={table.totalPages}
              onPrevious={table.goToPreviousPage}
              onNext={table.goToNextPage}
            />
          </>
        )}
      </div>

      {openModal === 'promedios' && (
        <Modal
          title="Promedio por sucursal"
          subtitle="Calificación promedio vigente de cada sucursal de la empresa."
          onClose={() => setOpenModal(null)}
        >
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <ul className="divide-y divide-slate-100">
              {branchAverages.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <Building2 className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {b.name}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {b.total} colaborador{b.total === 1 ? '' : 'es'} en planilla
                    </span>
                  </span>
                  <ScoreBadge score={b.promedio} />
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}

      {openModal === 'pendientes' && (
        <CollaboratorListModal
          title="Colaboradores pendientes de evaluar"
          subtitle="Miembros de la planilla activa sin evaluación registrada en el período."
          emptyMessage="Toda la planilla ya cuenta con su evaluación. ¡Índice al 100%!"
          collaborators={pending}
          onClose={() => setOpenModal(null)}
          onSelect={goToIndividual}
        />
      )}

      {openModal === 'bajo' && (
        <CollaboratorListModal
          title="Plan de bajo rendimiento"
          subtitle={`Colaboradores con promedio menor a ${LOW_PERFORMANCE_THRESHOLD}/10 que requieren seguimiento.`}
          emptyMessage="Ningún colaborador se encuentra bajo el umbral de rendimiento."
          collaborators={lowPerformers}
          onClose={() => setOpenModal(null)}
          onSelect={goToIndividual}
        />
      )}
    </div>
  )
}
