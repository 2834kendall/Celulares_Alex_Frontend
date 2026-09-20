'use client'

import { useState } from 'react'
import {
  CalendarCheck2,
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Users,
} from 'lucide-react'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { buildJustificationQueue } from '@/modules/attendance/lib/pendingJustifications'
import { IncidentRow } from '@/modules/attendance/components/IncidentRow'
import { useMonthNavigation } from '@/modules/attendance/hooks/useMonthNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { IconButton } from '@/components/ui/IconButton'
import { TABLE_WRAP } from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

interface MonthlySummaryTableProps {
  /** "YYYY-MM-01" — el mes que se esta viendo. */
  monthISO: string
  rows: MonthlyEmployeeSummary[]
}

type Filter = 'incidencias' | 'todos'

function formatMonth(monthISO: string) {
  const label = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(
    new Date(`${monthISO}T00:00:00`)
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function hasIncidents(row: MonthlyEmployeeSummary) {
  return row.tardyDays.length > 0 || row.absentDays.length > 0 || row.justifiedAbsences.length > 0
}

/** Todos los dias de una persona, pendientes y resueltos, lo mas reciente primero. */
function detailItems(row: MonthlyEmployeeSummary) {
  const { pending, resolved } = buildJustificationQueue([row])
  return [...pending, ...resolved].sort((a, b) => b.date.localeCompare(a.date))
}

function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/**
 * Resumen mensual de tardias/ausencias por colaborador (RF-07/RF-08), con el
 * detalle de que dias exactamente. Solo consulta: justificar se hace en la
 * pestaña "Por justificar" (SGRH-88), que junta lo pendiente de todos.
 *
 * Lista en vez de tabla: con dos numeros por persona, una tabla de ancho
 * completo dejaba los conteos lejos del nombre. Cada colaborador es una fila
 * tocable con sus conteos como chips, y al abrirla cada dia es una tarjeta.
 * Arranca filtrado a quienes tienen algo que ver.
 */
export function MonthlySummaryTable({ monthISO, rows }: MonthlySummaryTableProps) {
  const { isNavigating, goToPreviousMonth, goToNextMonth } = useMonthNavigation(monthISO)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const withIncidents = rows.filter(hasIncidents)
  // Si nadie tiene nada, arrancar en "con incidencias" mostraria una lista
  // vacia: se abre directo en "todos".
  const [filter, setFilter] = useState<Filter>(withIncidents.length > 0 ? 'incidencias' : 'todos')
  const visibleRows = filter === 'incidencias' ? withIncidents : rows

  const totalTardias = rows.reduce((sum, r) => sum + r.tardias, 0)
  const totalAusencias = rows.reduce((sum, r) => sum + r.ausencias, 0)

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    visibleRows,
    10
  )

  return (
    // Mismo criterio que el panel diario: se mide el contenedor, no el
    // viewport, para que ambas pestañas se comporten igual con el sidebar
    // abierto, cerrado, o en cualquier tamaño intermedio.
    <div className="@container space-y-4">
      {/* Mismo criterio que el panel diario: una columna o tres, nunca dos. */}
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
        <StatCard icon={Users} label="Colaboradores" value={rows.length} />
        <StatCard icon={Clock} tone="amber" label="Tardias del mes" value={totalTardias} />
        <StatCard icon={CalendarX2} tone="rose" label="Ausencias del mes" value={totalAusencias} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton onClick={goToPreviousMonth} disabled={isNavigating} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <h2 className="min-w-0 truncate px-1 text-sm font-bold text-slate-900">
            {formatMonth(monthISO)}
          </h2>
          <IconButton onClick={goToNextMonth} disabled={isNavigating} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </IconButton>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        {rows.length > 0 && (
          <div
            role="group"
            aria-label="Filtrar colaboradores"
            className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5 text-xs font-semibold"
          >
            {(
              [
                ['incidencias', `Con incidencias (${withIncidents.length})`],
                ['todos', `Todos (${rows.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-[10px] px-3 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-600/40 pointer-coarse:min-h-11 ${
                  filter === value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay colaboradores activos en esta sucursal"
          description="Verifica que existan contratos activos asignados a esta sucursal."
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="Nadie tiene tardias ni ausencias este mes"
          description="Cambia a “Todos” para ver a todo el personal."
        />
      ) : (
        <div className={TABLE_WRAP}>
          <ul className="divide-y divide-slate-100">
            {paginatedItems.map((row) => {
              const expanded = expandedId === row.employmentHistoryId
              const withDetail = hasIncidents(row)
              const detailId = `detalle-${row.employmentHistoryId}`

              return (
                <li key={row.employmentHistoryId}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : row.employmentHistoryId)}
                    disabled={!withDetail}
                    aria-expanded={withDetail ? expanded : undefined}
                    aria-controls={withDetail ? detailId : undefined}
                    className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition enabled:hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600/40 disabled:cursor-default sm:px-4"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
                    >
                      {initials(row.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {row.fullName}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {row.tardias > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                            {plural(row.tardias, 'tardia', 'tardias')}
                          </span>
                        )}
                        {row.ausencias > 0 && (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            {plural(row.ausencias, 'ausencia', 'ausencias')}
                          </span>
                        )}
                        {row.tardias === 0 && row.ausencias === 0 && (
                          <span className="text-[11px] text-slate-400">
                            {withDetail ? 'Todo justificado' : 'Sin incidencias'}
                          </span>
                        )}
                      </span>
                    </span>
                    {withDetail && (
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>

                  {expanded && (
                    <ul
                      id={detailId}
                      className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4"
                    >
                      {detailItems(row).map((item) => (
                        <IncidentRow
                          key={`${item.kind}-${item.date}-${item.kind === 'tardia' ? item.day.kind : ''}`}
                          item={item}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
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
