'use client'

import { Fragment, useState } from 'react'
import {
  AlertTriangle,
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Users,
} from 'lucide-react'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { useMonthNavigation } from '@/modules/attendance/hooks/useMonthNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'

interface MonthlySummaryTableProps {
  /** "YYYY-MM-01" — el mes que se esta viendo. */
  monthISO: string
  rows: MonthlyEmployeeSummary[]
}

function formatMonth(monthISO: string) {
  const label = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(
    new Date(`${monthISO}T00:00:00`)
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatDayShort(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short' }).format(
    new Date(`${dateISO}T00:00:00`)
  )
}

/**
 * Resumen mensual de tardias/ausencias por colaborador (RF-07/RF-08), con el
 * detalle de que dias exactamente — lo que checkMonthlyInfractions calcula
 * puertas adentro para la advertencia silenciosa, pero nunca le mostraba al
 * gerente. Navegable mes a mes, a diferencia de esa accion (que solo mira el
 * mes en curso).
 */
export function MonthlySummaryTable({ monthISO, rows }: MonthlySummaryTableProps) {
  const { isNavigating, goToPreviousMonth, goToNextMonth } = useMonthNavigation(monthISO)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const totalTardias = rows.reduce((sum, r) => sum + r.tardias, 0)
  const totalAusencias = rows.reduce((sum, r) => sum + r.ausencias, 0)

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    rows,
    10
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Colaboradores</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{rows.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Tardias del mes</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{totalTardias}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <CalendarX2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Ausencias del mes</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{totalAusencias}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold capitalize text-slate-900">{formatMonth(monthISO)}</h2>
          <p className="truncate text-xs text-slate-500">Tardias y ausencias por colaborador.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={goToPreviousMonth}
            disabled={isNavigating}
            aria-label="Mes anterior"
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <button
            type="button"
            onClick={goToNextMonth}
            disabled={isNavigating}
            aria-label="Mes siguiente"
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              No hay colaboradores activos en esta sucursal
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Verifica que existan contratos activos asignados a esta sucursal.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Colaborador</th>
                  <th className="px-3 py-2 text-left font-semibold">Tardias</th>
                  <th className="px-3 py-2 text-left font-semibold">Ausencias</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((row) => {
                  const expanded = expandedId === row.employmentHistoryId
                  const hasDetail = row.tardias > 0 || row.ausencias > 0
                  return (
                    <Fragment key={row.employmentHistoryId}>
                      <tr className="border-t border-slate-100 transition hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.fullName}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.tardias > 0
                                ? 'font-semibold tabular-nums text-amber-700'
                                : 'tabular-nums text-slate-400'
                            }
                          >
                            {row.tardias}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.ausencias > 0
                                ? 'font-semibold tabular-nums text-rose-700'
                                : 'tabular-nums text-slate-400'
                            }
                          >
                            {row.ausencias}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {hasDetail && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(expanded ? null : row.employmentHistoryId)
                              }
                              aria-label={expanded ? 'Ocultar dias' : 'Ver dias'}
                              aria-expanded={expanded}
                              className="rounded-full p-1 text-slate-400 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-slate-100 bg-slate-50/50">
                          <td colSpan={4} className="px-3 py-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {row.tardyDays.length > 0 && (
                                <div>
                                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                    <Clock className="h-3 w-3" /> Tardias
                                  </p>
                                  <ul className="space-y-0.5">
                                    {row.tardyDays.map((d) => (
                                      <li key={d.date} className="text-slate-600">
                                        <span className="font-medium capitalize">
                                          {formatDayShort(d.date)}
                                        </span>{' '}
                                        — llego a las {d.entradaTime} (+{d.diffMinutes} min)
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {row.absentDays.length > 0 && (
                                <div>
                                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                                    <AlertTriangle className="h-3 w-3" /> Ausencias
                                  </p>
                                  <ul className="space-y-0.5">
                                    {row.absentDays.map((date) => (
                                      <li key={date} className="capitalize text-slate-600">
                                        {formatDayShort(date)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
        </div>
      )}
    </div>
  )
}
