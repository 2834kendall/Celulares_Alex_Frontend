'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
  X,
  ListChecks,
  CheckCircle2,
  Clock,
  CalendarX,
  ChevronRight,
} from 'lucide-react'
import type { ScheduleRow } from '@/modules/schedules/types'
import { deleteSchedule } from '@/modules/schedules/actions/deleteSchedule'
import { ScheduleForm } from './ScheduleForm'

interface TipoJornada {
  tjo_id: number
  tjo_nombre: string
}

interface SchedulesListProps {
  schedules: ScheduleRow[]
  tiposJornada: TipoJornada[]
  canWrite: boolean
}

export function SchedulesList({ schedules, tiposJornada, canWrite }: SchedulesListProps) {
  const [editing, setEditing] = useState<ScheduleRow | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const total = schedules.length
  const activos = schedules.filter((s) => s.hor_activo).length

  function tipoNombre(id: number | null | undefined) {
    return tiposJornada.find((t) => t.tjo_id === id)?.tjo_nombre ?? '—'
  }

  function stripSeconds(time: string) {
    return time.slice(0, 5)
  }

  async function handleDelete(id: number) {
    if (!confirm('Seguro que desea eliminar este horario?')) return
    setDeleteError(null)
    setDeletingId(id)
    const result = await deleteSchedule(id)
    setDeletingId(null)
    if (!result.ok) setDeleteError(result.error)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ListChecks className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Total plantillas</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{total}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Activas</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{activos}</p>
          </div>
        </div>
        <Link
          href="?tab=jornadas"
          className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] outline-none transition hover:border-blue-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-slate-500">Tipos de jornada</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{tiposJornada.length}</p>
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
          <button
            onClick={() => setEditing('new')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo horario
          </button>
        )}
      </div>

      {deleteError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{deleteError}</div>
        </div>
      )}

      {editing && (
        <div className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <button
            onClick={() => setEditing(null)}
            aria-label="Cerrar formulario"
            className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <h3 className="mb-3 pr-8 text-sm font-bold text-slate-900">
            {editing === 'new' ? 'Nuevo horario' : `Editar: ${editing.hor_nombre}`}
          </h3>
          <ScheduleForm
            schedule={editing === 'new' ? undefined : editing}
            tiposJornada={tiposJornada}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <CalendarX className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Todavía no hay horarios registrados
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Crea una plantilla de jornada para poder asignarla luego en la matriz semanal.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setEditing('new')}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Crear la primera plantilla
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold">Entrada</th>
                  <th className="px-3 py-2 text-left font-semibold">Salida</th>
                  <th className="px-3 py-2 text-left font-semibold">Almuerzo</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado</th>
                  {canWrite && <th className="px-3 py-2 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr
                    key={schedule.hor_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === schedule.hor_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{schedule.hor_nombre}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {tipoNombre(schedule.hor_tipo_jornada_id)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {stripSeconds(schedule.hor_hora_entrada)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {stripSeconds(schedule.hor_hora_salida)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {stripSeconds(schedule.hor_hora_inicio_almuerzo)} -{' '}
                      {stripSeconds(schedule.hor_hora_fin_almuerzo)}
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
                          <button
                            onClick={() => setEditing(schedule)}
                            aria-label="Editar"
                            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule.hor_id)}
                            disabled={deletingId === schedule.hor_id}
                            aria-label="Eliminar"
                            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
