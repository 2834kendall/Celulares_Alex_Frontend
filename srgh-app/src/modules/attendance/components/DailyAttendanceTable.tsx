'use client'

import { useRef, useState } from 'react'
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
import { IconButton } from '@/components/ui/IconButton'
import { TABLE_HEAD, TABLE_ROW, TABLE_TH, TABLE_WRAP } from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

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
        <IconButton
          onClick={onEdit}
          aria-label={mark ? 'Corregir marca' : 'Agregar marca'}
          tone="blue"
        >
          {mark ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </IconButton>
      )}
    </div>
  )
}

export function DailyAttendanceTable({ dateISO, rows, canWrite }: DailyAttendanceTableProps) {
  const { isNavigating, goToPreviousDay, goToNextDay, goToDate } = useDateNavigation(dateISO)
  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

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
        <StatCard icon={Users} label="Colaboradores" value={total} />
        <StatCard
          icon={CalendarDays}
          tone="emerald"
          label="Con entrada marcada"
          value={conEntrada}
        />
        <StatCard
          icon={AlertTriangle}
          tone="amber"
          label="Jornadas sin salida"
          value={jornadasAbiertas}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold capitalize text-slate-900">{formatDay(dateISO)}</h2>
          <p className="truncate text-xs text-slate-500">Marcas de asistencia del dia.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton onClick={goToPreviousDay} disabled={isNavigating} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <IconButton onClick={goToNextDay} disabled={isNavigating} aria-label="Dia siguiente">
            <ChevronRight className="h-4 w-4" />
          </IconButton>
          <div className="relative">
            <IconButton
              onClick={() => {
                const input = dateInputRef.current
                if (!input) return
                if (typeof input.showPicker === 'function') {
                  input.showPicker()
                } else {
                  input.focus()
                }
              }}
              disabled={isNavigating}
              aria-label="Elegir fecha"
            >
              <CalendarDays className="h-4 w-4" />
            </IconButton>
            <input
              ref={dateInputRef}
              type="date"
              value={dateISO}
              onChange={(e) => {
                if (e.target.value) goToDate(e.target.value)
              }}
              aria-label="Fecha"
              className="sr-only"
            />
          </div>
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
                  <th className={TABLE_TH}>Entrada</th>
                  <th className={TABLE_TH}>Inicio almuerzo</th>
                  <th className={TABLE_TH}>Fin almuerzo</th>
                  <th className={TABLE_TH}>Salida</th>
                  <th className={TABLE_TH}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((row) => (
                  <tr key={row.employmentHistoryId} className={TABLE_ROW}>
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
