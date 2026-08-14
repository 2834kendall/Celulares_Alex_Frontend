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
import { IconButton } from '@/components/ui/IconButton'
import {
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_WRAP,
} from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

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
        <StatCard icon={Users} label="Colaboradores" value={rows.length} />
        <StatCard icon={Clock} tone="amber" label="Tardias del mes" value={totalTardias} />
        <StatCard icon={CalendarX2} tone="rose" label="Ausencias del mes" value={totalAusencias} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold capitalize text-slate-900">{formatMonth(monthISO)}</h2>
          <p className="truncate text-xs text-slate-500">Tardias y ausencias por colaborador.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton onClick={goToPreviousMonth} disabled={isNavigating} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <IconButton onClick={goToNextMonth} disabled={isNavigating} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay colaboradores activos en esta sucursal"
          description="Verifica que existan contratos activos asignados a esta sucursal."
        />
      ) : (
        <div className={TABLE_WRAP}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Colaborador</th>
                  <th className={TABLE_TH}>Tardias</th>
                  <th className={TABLE_TH}>Ausencias</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((row) => {
                  const expanded = expandedId === row.employmentHistoryId
                  const hasDetail = row.tardias > 0 || row.ausencias > 0
                  return (
                    <Fragment key={row.employmentHistoryId}>
                      <tr className={TABLE_ROW}>
                        <td className={TABLE_TD_STRONG}>{row.fullName}</td>
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
                            <IconButton
                              onClick={() =>
                                setExpandedId(expanded ? null : row.employmentHistoryId)
                              }
                              aria-label={expanded ? 'Ocultar dias' : 'Ver dias'}
                              aria-expanded={expanded}
                              tone="blue"
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            </IconButton>
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
