'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Pencil,
  Plus,
  Trash2,
  X,
  ListChecks,
  CheckCircle2,
  Clock,
  CalendarX,
  ChevronRight,
  Search,
} from 'lucide-react'
import type { ScheduleRow } from '@/modules/schedules/types'
import { deleteSchedule } from '@/modules/schedules/actions/deleteSchedule'
import { stripSeconds } from '@/modules/schedules/lib/time'
import { useCrudList } from '@/modules/schedules/hooks/useCrudList'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { ScheduleForm } from './ScheduleForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import {
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
  TABLE_WRAP,
} from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

interface ShiftTypeOption {
  tjo_id: number
  tjo_nombre: string
}

interface SchedulesListProps {
  schedules: ScheduleRow[]
  shiftTypes: ShiftTypeOption[]
  canWrite: boolean
}

export function SchedulesList({ schedules, shiftTypes, canWrite }: SchedulesListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<ScheduleRow>(deleteSchedule)

  const total = schedules.length
  const activeCount = schedules.filter((s) => s.hor_activo).length

  const [nameFilter, setNameFilter] = useState('')

  const filteredSchedules = useMemo(() => {
    const query = normalizeSearchText(nameFilter.trim())
    if (!query) return schedules
    return schedules.filter((s) => normalizeSearchText(s.hor_nombre).includes(query))
  }, [schedules, nameFilter])

  const {
    page,
    totalPages,
    paginatedItems: paginatedSchedules,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(filteredSchedules, 8)

  function shiftTypeName(id: number | null | undefined) {
    return shiftTypes.find((t) => t.tjo_id === id)?.tjo_nombre ?? '—'
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <StatCard icon={ListChecks} label="Total plantillas" value={total} hoverable />
        <StatCard
          icon={CheckCircle2}
          tone="emerald"
          label="Activas"
          value={activeCount}
          hoverable
        />
        <Link
          href="?tab=jornadas"
          className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-blue-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-slate-500">Tipos de jornada</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{shiftTypes.length}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Plantillas de horario</h2>
          <p className="truncate text-xs text-slate-500">
            Catálogo de jornadas reutilizables para la matriz semanal.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo horario
          </Button>
        )}
      </div>

      {deleteError && (
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      {editing && (
        <div className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <IconButton
            onClick={() => setEditing(null)}
            aria-label="Cerrar formulario"
            className="absolute right-3.5 top-3.5"
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
          <h3 className="mb-3 pr-8 text-sm font-bold text-slate-900">
            {editing === 'new' ? 'Nuevo horario' : `Editar: ${editing.hor_nombre}`}
          </h3>
          <ScheduleForm
            schedule={editing === 'new' ? undefined : editing}
            shiftTypes={shiftTypes}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {schedules.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Buscar por nombre..."
            aria-label="Buscar plantilla por nombre"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
          />
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Todavía no hay horarios registrados"
          description="Crea una plantilla de jornada para poder asignarla luego en la matriz semanal."
          action={
            canWrite && (
              <Button onClick={() => setEditing('new')} className="mt-1">
                <Plus className="h-3.5 w-3.5" /> Crear la primera plantilla
              </Button>
            )
          }
        />
      ) : filteredSchedules.length === 0 ? (
        <EmptyState
          icon={Search}
          title={`Ningún horario coincide con “${nameFilter}”`}
          description="Prueba con otro nombre."
        />
      ) : (
        <div className={TABLE_WRAP}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Nombre</th>
                  <th className={TABLE_TH}>Tipo</th>
                  <th className={TABLE_TH}>Entrada</th>
                  <th className={TABLE_TH}>Salida</th>
                  <th className={TABLE_TH}>Almuerzo</th>
                  <th className={TABLE_TH}>Break</th>
                  <th className={TABLE_TH}>Estado</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedSchedules.map((schedule) => (
                  <tr
                    key={schedule.hor_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === schedule.hor_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className={TABLE_TD_STRONG}>{schedule.hor_nombre}</td>
                    <td className={TABLE_TD}>{shiftTypeName(schedule.hor_tipo_jornada_id)}</td>
                    <td className={TABLE_TD_NUM}>{stripSeconds(schedule.hor_hora_entrada)}</td>
                    <td className={TABLE_TD_NUM}>{stripSeconds(schedule.hor_hora_salida)}</td>
                    <td className={TABLE_TD_NUM}>
                      {stripSeconds(schedule.hor_hora_inicio_almuerzo)} -{' '}
                      {stripSeconds(schedule.hor_hora_fin_almuerzo)}
                    </td>
                    <td className={TABLE_TD_NUM}>
                      {schedule.hor_hora_inicio_break && schedule.hor_hora_fin_break
                        ? `${stripSeconds(schedule.hor_hora_inicio_break)} - ${stripSeconds(schedule.hor_hora_fin_break)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          schedule.hor_activo
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {schedule.hor_activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(schedule)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            onClick={() => requestDelete(schedule.hor_id)}
                            disabled={deletingId === schedule.hor_id}
                            aria-label="Eliminar"
                            tone="rose"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    )}
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

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar horario"
          message="La plantilla se eliminará de forma permanente. Esta acción no se puede deshacer."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
