'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Users,
} from 'lucide-react'
import type {
  DailyAttendanceRow,
  DailyMarkInfo,
} from '@/modules/attendance/actions/getDailyAttendance'
import { useDateNavigation } from '@/modules/attendance/hooks/useDateNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ManualMarkModal } from '@/modules/attendance/components/ManualMarkModal'
import type { MarkType } from '@/modules/attendance/lib/marks'

interface DailyAttendanceTableProps {
  dateISO: string
  rows: DailyAttendanceRow[]
  canWrite: boolean
}

interface EditingTarget {
  row: DailyAttendanceRow
  tipo: MarkType
}

const MARK_FIELD: Record<
  MarkType,
  keyof Pick<DailyAttendanceRow, 'entrada' | 'salida' | 'inicioAlmuerzo' | 'finAlmuerzo'>
> = {
  entrada: 'entrada',
  salida: 'salida',
  inicio_almuerzo: 'inicioAlmuerzo',
  fin_almuerzo: 'finAlmuerzo',
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00`))
}

/**
 * Muestra la hora y, solo si viene informada, la diferencia en minutos —
 * como dato neutro (sin colorear "tarde"/"a tiempo"): la tolerancia todavia
 * no esta implementada, y colorear esto seria clasificar sin base.
 */
function MarkCell({
  mark,
  canWrite,
  onEdit,
}: {
  mark: DailyMarkInfo | null
  canWrite: boolean
  onEdit: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      {mark ? (
        <span className="tabular-nums text-slate-700">
          {mark.time}
          {mark.diffMinutes !== null && mark.diffMinutes !== 0 && (
            <span className="ml-1 text-[10px] font-medium text-slate-400">
              ({mark.diffMinutes > 0 ? '+' : ''}
              {mark.diffMinutes} min)
            </span>
          )}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      )}
      {canWrite && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={mark ? 'Corregir marca' : 'Agregar marca'}
          className="rounded-full p-1 text-slate-400 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          {mark ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}

export function DailyAttendanceTable({ dateISO, rows, canWrite }: DailyAttendanceTableProps) {
  const { isNavigating, goToPreviousDay, goToNextDay } = useDateNavigation(dateISO)
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  const total = rows.length
  const conEntrada = rows.filter((r) => r.entrada !== null).length
  const jornadasAbiertas = rows.filter((r) => r.isOpen).length

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
            <p className="text-base font-bold tabular-nums text-slate-900">{total}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Con entrada marcada</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{conEntrada}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Jornadas sin salida</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{jornadasAbiertas}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold capitalize text-slate-900">{formatDay(dateISO)}</h2>
          <p className="truncate text-xs text-slate-500">Marcas de asistencia del dia.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={goToPreviousDay}
            disabled={isNavigating}
            aria-label="Dia anterior"
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <button
            type="button"
            onClick={goToNextDay}
            disabled={isNavigating}
            aria-label="Dia siguiente"
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
                  <th className="px-3 py-2 text-left font-semibold">Entrada</th>
                  <th className="px-3 py-2 text-left font-semibold">Inicio almuerzo</th>
                  <th className="px-3 py-2 text-left font-semibold">Fin almuerzo</th>
                  <th className="px-3 py-2 text-left font-semibold">Salida</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((row) => (
                  <tr
                    key={row.employmentHistoryId}
                    className="border-t border-slate-100 transition hover:bg-slate-50/70"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{row.fullName}</p>
                      {row.position && <p className="text-[11px] text-slate-500">{row.position}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.entrada}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'entrada' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.inicioAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'inicio_almuerzo' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.finAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'fin_almuerzo' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.salida}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'salida' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {row.isDayOff && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            Dia libre
                          </span>
                        )}
                        {row.isHoliday && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            Feriado
                          </span>
                        )}
                        {row.isOpen && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> Sin salida
                          </span>
                        )}
                        {row.duplicateMarksCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            {row.duplicateMarksCount} marca(s) duplicada(s)
                          </span>
                        )}
                      </div>
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
        </div>
      )}

      {editing &&
        (() => {
          const mark = editing.row[MARK_FIELD[editing.tipo]]
          return (
            <ManualMarkModal
              employmentHistoryId={editing.row.employmentHistoryId}
              employeeId={editing.row.employeeId}
              employeeName={editing.row.fullName}
              sucursalId={editing.row.branchId}
              tipo={editing.tipo}
              markId={mark?.id ?? null}
              currentFechaHora={mark ? `${dateISO} ${mark.time}:00` : null}
              defaultDateISO={dateISO}
              onClose={() => setEditing(null)}
            />
          )
        })()}
    </div>
  )
}
