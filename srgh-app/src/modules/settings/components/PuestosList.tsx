'use client'

import { Briefcase, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Puesto } from '@/modules/settings/actions/getPuestos'
import { deletePuesto } from '@/modules/settings/actions/deletePuesto'
import { useCrudList } from '@/modules/settings/hooks/useCrudList'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PuestoForm } from './PuestoForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import {
  TABLE_DESKTOP_WRAP,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'

interface PuestosListProps {
  puestos: Puesto[]
  canWrite: boolean
}

function formatSalario(valor: number | null): string {
  return valor === null ? '—' : valor.toLocaleString('es-CR', { maximumFractionDigits: 0 })
}

export function PuestosList({ puestos, canWrite }: PuestosListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<Puesto>(deletePuesto)

  const {
    page,
    totalPages,
    paginatedItems: paginatedPuestos,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(puestos, 8)

  return (
    <div className="@container space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Puestos</h2>
          <p className="truncate text-xs text-slate-500">
            Catálogo de puestos de la empresa, usado al contratar empleados.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo puesto
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
            {editing === 'new' ? 'Nuevo puesto' : `Editar: ${editing.pue_nombre}`}
          </h3>
          <PuestoForm
            puesto={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {puestos.length === 0 ? (
        !editing && (
          <EmptyState
            icon={Briefcase}
            title="No hay puestos"
            description="Crea el primero para poder asignarlo al contratar empleados."
            action={
              canWrite && (
                <Button onClick={() => setEditing('new')} className="mt-1">
                  <Plus className="h-3.5 w-3.5" /> Crear el primero
                </Button>
              )
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/* Movil: tarjeta por puesto */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedPuestos.map((puesto, i) => (
              <li
                key={puesto.pue_id}
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className={`animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 ${
                  deletingId === puesto.pue_id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{puesto.pue_nombre}</p>
                    {puesto.pue_descripcion && (
                      <p className="mt-0.5 break-words text-[11px] text-slate-500">
                        {puesto.pue_descripcion}
                      </p>
                    )}
                  </div>
                  {!puesto.pue_activo && (
                    <Badge tone="slate" size="xs">
                      Inactivo
                    </Badge>
                  )}
                </div>

                <p className="border-t border-slate-100 pt-3 text-xs tabular-nums text-slate-600">
                  Salario mínimo: {formatSalario(puesto.pue_salario_minimo_referencia)}
                </p>

                {canWrite && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <IconButton onClick={() => setEditing(puesto)} aria-label="Editar" tone="blue">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      onClick={() => requestDelete(puesto.pue_id)}
                      disabled={deletingId === puesto.pue_id}
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

          <div className={TABLE_DESKTOP_WRAP}>
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Nombre</th>
                  <th className={TABLE_TH}>Descripción</th>
                  <th className={TABLE_TH}>Salario mínimo</th>
                  <th className={TABLE_TH}>Estado</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedPuestos.map((puesto) => (
                  <tr
                    key={puesto.pue_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === puesto.pue_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className={TABLE_TD_STRONG}>{puesto.pue_nombre}</td>
                    <td className={TABLE_TD}>{puesto.pue_descripcion ?? '—'}</td>
                    <td className={TABLE_TD_NUM}>
                      {formatSalario(puesto.pue_salario_minimo_referencia)}
                    </td>
                    <td className="px-3 py-2">
                      {puesto.pue_activo ? (
                        <Badge tone="emerald" size="xs">
                          Activo
                        </Badge>
                      ) : (
                        <Badge tone="slate" size="xs">
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(puesto)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            onClick={() => requestDelete(puesto.pue_id)}
                            disabled={deletingId === puesto.pue_id}
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
          title="Eliminar puesto"
          message="El puesto se eliminará de forma permanente. No podrá eliminarse si algún empleado o postulación lo usa."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
