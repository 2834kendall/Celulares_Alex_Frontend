'use client'

import { AlertTriangle, Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ShiftType } from '@/modules/schedules/actions/getShiftTypes'
import { deleteShiftType } from '@/modules/schedules/actions/deleteShiftType'
import { useCrudList } from '@/modules/schedules/hooks/useCrudList'
import { ConfirmDialog } from './ConfirmDialog'
import { ShiftTypeForm } from './ShiftTypeForm'

interface ShiftTypesListProps {
  shiftTypes: ShiftType[]
  canWrite: boolean
}

export function ShiftTypesList({ shiftTypes, canWrite }: ShiftTypesListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<ShiftType>(deleteShiftType)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Tipos de jornada</h2>
          <p className="truncate text-xs text-slate-500">
            Catálogo global de clasificaciones laborales, usado para clasificar cada plantilla de
            horario.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setEditing('new')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo tipo de jornada
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
            {editing === 'new' ? 'Nuevo tipo de jornada' : `Editar: ${editing.tjo_nombre}`}
          </h3>
          <ShiftTypeForm
            shiftType={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {shiftTypes.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No hay tipos de jornada</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Crea el primero para poder clasificar tus plantillas de horario.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setEditing('new')}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Código</th>
                  <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                  <th className="px-3 py-2 text-left font-semibold">Horas máx. diarias</th>
                  <th className="px-3 py-2 text-left font-semibold">Horas máx. semanales</th>
                  <th className="px-3 py-2 text-left font-semibold">Recargo</th>
                  {canWrite && <th className="px-3 py-2 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {shiftTypes.map((shiftType) => (
                  <tr
                    key={shiftType.tjo_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === shiftType.tjo_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{shiftType.tjo_codigo}</td>
                    <td className="px-3 py-2 text-slate-600">{shiftType.tjo_nombre}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {shiftType.tjo_horas_max_diarias ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {shiftType.tjo_horas_max_semanales ?? '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {shiftType.tjo_recargo_porcentaje}%
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(shiftType)}
                            aria-label="Editar"
                            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => requestDelete(shiftType.tjo_id)}
                            disabled={deletingId === shiftType.tjo_id}
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

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar tipo de jornada"
          message="El tipo de jornada se eliminará de forma permanente. No podrá eliminarse si alguna plantilla de horario lo usa."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
