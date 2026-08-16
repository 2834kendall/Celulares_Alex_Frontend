'use client'

import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ShiftType } from '@/modules/schedules/actions/getShiftTypes'
import { deleteShiftType } from '@/modules/schedules/actions/deleteShiftType'
import { useCrudList } from '@/modules/schedules/hooks/useCrudList'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ShiftTypeForm } from './ShiftTypeForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'

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

  const {
    page,
    totalPages,
    paginatedItems: paginatedShiftTypes,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(shiftTypes, 8)

  return (
    <div className="@container space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Tipos de jornada</h2>
          <p className="truncate text-xs text-slate-500">
            Catálogo global de clasificaciones laborales, usado para clasificar cada plantilla de
            horario.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo tipo de jornada
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
            {editing === 'new' ? 'Nuevo tipo de jornada' : `Editar: ${editing.tjo_nombre}`}
          </h3>
          <ShiftTypeForm
            shiftType={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {shiftTypes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No hay tipos de jornada"
          description="Crea el primero para poder clasificar tus plantillas de horario."
          action={
            canWrite && (
              <Button onClick={() => setEditing('new')} className="mt-1">
                <Plus className="h-3.5 w-3.5" /> Crear el primero
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Movil: tarjeta por tipo de jornada. Las tres cifras son limites y
            recargo, que sin encabezado son numeros sueltos — van rotuladas.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedShiftTypes.map((shiftType, i) => (
              <li
                key={shiftType.tjo_id}
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className={`animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 ${
                  deletingId === shiftType.tjo_id ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{shiftType.tjo_codigo}</p>
                  <p className="mt-0.5 break-words text-[11px] text-slate-500">
                    {shiftType.tjo_nombre}
                  </p>
                </div>

                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                  {[
                    {
                      label: 'Máx. diarias',
                      valor: String(shiftType.tjo_horas_max_diarias ?? '—'),
                    },
                    {
                      label: 'Máx. semanales',
                      valor: String(shiftType.tjo_horas_max_semanales ?? '—'),
                    },
                    { label: 'Recargo', valor: `${shiftType.tjo_recargo_porcentaje}%` },
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 text-xs tabular-nums text-slate-600">{valor}</dd>
                    </div>
                  ))}
                </dl>

                {canWrite && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <IconButton
                      onClick={() => setEditing(shiftType)}
                      aria-label="Editar"
                      tone="blue"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => requestDelete(shiftType.tjo_id)}
                      disabled={deletingId === shiftType.tjo_id}
                      aria-label="Eliminar"
                      tone="rose"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden @3xl:block @3xl:overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Código</th>
                  <th className={TABLE_TH}>Nombre</th>
                  <th className={TABLE_TH}>Horas máx. diarias</th>
                  <th className={TABLE_TH}>Horas máx. semanales</th>
                  <th className={TABLE_TH}>Recargo</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedShiftTypes.map((shiftType) => (
                  <tr
                    key={shiftType.tjo_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === shiftType.tjo_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className={TABLE_TD_STRONG}>{shiftType.tjo_codigo}</td>
                    <td className={TABLE_TD}>{shiftType.tjo_nombre}</td>
                    <td className={TABLE_TD_NUM}>{shiftType.tjo_horas_max_diarias ?? '—'}</td>
                    <td className={TABLE_TD_NUM}>{shiftType.tjo_horas_max_semanales ?? '—'}</td>
                    <td className={TABLE_TD_NUM}>{shiftType.tjo_recargo_porcentaje}%</td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(shiftType)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            onClick={() => requestDelete(shiftType.tjo_id)}
                            disabled={deletingId === shiftType.tjo_id}
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
          title="Eliminar tipo de jornada"
          message="El tipo de jornada se eliminará de forma permanente. No podrá eliminarse si alguna plantilla de horario lo usa."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
