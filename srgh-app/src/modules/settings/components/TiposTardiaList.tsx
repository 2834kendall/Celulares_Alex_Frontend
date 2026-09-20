'use client'

import type { CSSProperties } from 'react'
import { Clock, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { TipoTardia } from '@/modules/settings/actions/getTiposTardia'
import { deleteTipoTardia } from '@/modules/settings/actions/deleteTipoTardia'
import { useCrudList } from '@/modules/settings/hooks/useCrudList'
import { rangeLabel, withNextStart } from '@/modules/settings/lib/tardiaRanges'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TipoTardiaForm } from './TipoTardiaForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import {
  TABLE_DESKTOP_WRAP,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { darken, lighten } from '@/lib/utils/color'

const DEFAULT_COLOR = '#F59E0B'

/** Mismo criterio que el chip de asistencia: fondo claro y texto oscuro del mismo tono. */
function chipStyle(color: string | null): CSSProperties {
  const base = color ?? DEFAULT_COLOR
  return {
    backgroundColor: lighten(base, 0.85),
    color: darken(base, 0.45),
    boxShadow: `inset 0 0 0 1px ${lighten(base, 0.55)}`,
  }
}

/**
 * Que pasa con los atrasos que cubria el tipo a borrar. No es lo mismo borrar
 * el primero que cualquier otro: los demas ceden su rango al tipo anterior,
 * pero el primero no tiene anterior — sus minutos DEJAN DE SER TARDIA. Eso
 * tiene que decirse antes de confirmar, no descubrirse en el reporte.
 */
function deleteMessage(
  filas: { tipo: TipoTardia; siguienteDesde: number | null }[],
  id: number
): string {
  const i = filas.findIndex((f) => f.tipo.tta_id === id)
  const fila = filas[i]
  if (!fila) return 'El tipo se eliminará de forma permanente.'

  const rango = rangeLabel(fila.tipo.tta_desde_minutos, fila.siguienteDesde)

  if (i === 0) {
    return `Es el primer tipo: los atrasos de ${rango} dejan de contar como tardía, también en los meses pasados.`
  }

  return `Los atrasos de ${rango} pasan a "${filas[i - 1].tipo.tta_nombre}", también en los meses pasados.`
}

interface TiposTardiaListProps {
  tipos: TipoTardia[]
  canWrite: boolean
}

/**
 * Catalogo de tipos de tardia de la empresa. Cada tipo guarda solo el minuto
 * donde empieza; el rango completo se muestra deducido, porque es lo que el
 * administrador necesita para saber en que tipo cae un atraso concreto.
 */
export function TiposTardiaList({ tipos, canWrite }: TiposTardiaListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<TipoTardia>(deleteTipoTardia)

  const filas = withNextStart(tipos)
  const primerMinuto = filas[0]?.tipo.tta_desde_minutos ?? null
  // Con uno solo no se ofrece borrar: la action lo rechazaria igual, y un
  // boton que siempre falla solo sirve para frustrar.
  const puedeBorrar = canWrite && tipos.length > 1

  return (
    <div className="@container space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Tipos de tardía</h2>
          <p className="text-xs text-slate-500">
            {primerMinuto === null
              ? 'Clasifican las llegadas tarde en el panel de asistencia.'
              : primerMinuto === 1
                ? 'Desde el primer minuto de atraso ya es tardía.'
                : `Un atraso de menos de ${primerMinuto} minutos no cuenta como tardía.`}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo tipo
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
            {editing === 'new' ? 'Nuevo tipo de tardía' : `Editar: ${editing.tta_nombre}`}
          </h3>
          <TipoTardiaForm
            tipo={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {filas.length === 0 ? (
        !editing && (
          <EmptyState
            icon={Clock}
            title="No hay tipos de tardía"
            description="Sin ningún tipo no se registra ninguna tardanza. Creá al menos uno."
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
          {/* Movil: tarjeta por tipo */}
          <ul className="space-y-3 @3xl:hidden">
            {filas.map(({ tipo, siguienteDesde }) => (
              <li
                key={tipo.tta_id}
                className={`space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                  deletingId === tipo.tta_id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    style={chipStyle(tipo.tta_color)}
                    className="rounded px-1.5 py-0.5 text-xs font-semibold"
                  >
                    {tipo.tta_nombre}
                  </span>
                  {!tipo.tta_cuenta_advertencia && (
                    <Badge tone="slate" size="xs">
                      No suma
                    </Badge>
                  )}
                </div>

                <p className="border-t border-slate-100 pt-3 text-xs tabular-nums text-slate-600">
                  {rangeLabel(tipo.tta_desde_minutos, siguienteDesde)} de atraso
                </p>

                {canWrite && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <IconButton onClick={() => setEditing(tipo)} aria-label="Editar" tone="blue">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    {puedeBorrar && (
                      <IconButton
                        onClick={() => requestDelete(tipo.tta_id)}
                        disabled={deletingId === tipo.tta_id}
                        aria-label="Eliminar"
                        tone="rose"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className={TABLE_DESKTOP_WRAP}>
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Tipo</th>
                  <th className={TABLE_TH}>Atraso</th>
                  <th className={TABLE_TH}>Advertencia del mes</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ tipo, siguienteDesde }) => (
                  <tr
                    key={tipo.tta_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === tipo.tta_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span
                        style={chipStyle(tipo.tta_color)}
                        className="rounded px-1.5 py-0.5 text-xs font-semibold"
                      >
                        {tipo.tta_nombre}
                      </span>
                    </td>
                    <td className={`${TABLE_TD} tabular-nums`}>
                      {rangeLabel(tipo.tta_desde_minutos, siguienteDesde)}
                    </td>
                    <td className="px-3 py-2">
                      {tipo.tta_cuenta_advertencia ? (
                        <Badge tone="emerald" size="xs">
                          Suma
                        </Badge>
                      ) : (
                        <Badge tone="slate" size="xs">
                          No suma
                        </Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(tipo)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          {puedeBorrar && (
                            <IconButton
                              onClick={() => requestDelete(tipo.tta_id)}
                              disabled={deletingId === tipo.tta_id}
                              aria-label="Eliminar"
                              tone="rose"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
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
          title="Eliminar tipo de tardía"
          message={deleteMessage(filas, confirmingId)}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
