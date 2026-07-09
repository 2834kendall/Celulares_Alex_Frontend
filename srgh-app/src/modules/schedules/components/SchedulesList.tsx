'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2, X, ListChecks, CheckCircle2, Clock } from 'lucide-react'
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

  const total = schedules.length
  const activos = schedules.filter((s) => s.hor_activo).length

  function tipoNombre(id: number | null | undefined) {
    return tiposJornada.find((t) => t.tjo_id === id)?.tjo_nombre ?? '—'
  }

  async function handleDelete(id: number) {
    if (!confirm('Seguro que desea eliminar este horario?')) return
    setDeletingId(id)
    const result = await deleteSchedule(id)
    setDeletingId(null)
    if (!result.ok) alert(result.error)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <ListChecks className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Plantillas</p>
            <p className="text-lg font-bold text-slate-900">{total}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Activas</p>
            <p className="text-lg font-bold text-slate-900">{activos}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
          <div className="rounded-lg bg-slate-50 p-2">
            <Clock className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tipos de Jornada</p>
            <p className="text-lg font-bold text-slate-900">{tiposJornada.length}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-900">Plantillas de Horario</h2>
        {canWrite && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition"
          >
            <Plus className="h-4 w-4" /> Nuevo horario
          </button>
        )}
      </div>

      {editing && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm relative">
          <button
            onClick={() => setEditing(null)}
            aria-label="Cerrar formulario"
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="font-bold text-slate-900 mb-4">
            {editing === 'new' ? 'Nuevo horario' : `Editar: ${editing.hor_nombre}`}
          </h3>
          <ScheduleForm
            schedule={editing === 'new' ? undefined : editing}
            tiposJornada={tiposJornada}
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Entrada</th>
              <th className="text-left px-4 py-3">Salida</th>
              <th className="text-left px-4 py-3">Almuerzo</th>
              <th className="text-left px-4 py-3">Estado</th>
              {canWrite && <th className="px-4 py-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No hay horarios registrados todavia.
                </td>
              </tr>
            )}
            {schedules.map((schedule) => (
              <tr key={schedule.hor_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{schedule.hor_nombre}</td>
                <td className="px-4 py-3 text-slate-600">
                  {tipoNombre(schedule.hor_tipo_jornada_id)}
                </td>
                <td className="px-4 py-3 text-slate-600">{schedule.hor_hora_entrada}</td>
                <td className="px-4 py-3 text-slate-600">{schedule.hor_hora_salida}</td>
                <td className="px-4 py-3 text-slate-600">
                  {schedule.hor_hora_inicio_almuerzo} - {schedule.hor_hora_fin_almuerzo}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${schedule.hor_activo ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                  >
                    {schedule.hor_activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditing(schedule)}
                        aria-label="Editar"
                        className="text-slate-400 hover:text-indigo-600 transition"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.hor_id)}
                        disabled={deletingId === schedule.hor_id}
                        aria-label="Eliminar"
                        className="text-slate-400 hover:text-rose-600 transition disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
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
  )
}
