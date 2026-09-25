'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Milestone, Pencil, Plus, Trash2 } from 'lucide-react'
import { FASES_SELECCION, type EtapaSeleccionRow } from '@/modules/recruitment/types'
import { deleteEtapaSeleccion } from '@/modules/recruitment/actions/deleteEtapaSeleccion'
import { moveEtapaSeleccion } from '@/modules/recruitment/actions/moveEtapaSeleccion'
import { useCrudList } from '@/modules/recruitment/hooks/useCrudList'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { EtapaSeleccionForm } from './EtapaSeleccionForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'

interface EtapasSeleccionManagerProps {
  etapas: EtapaSeleccionRow[]
  canWrite: boolean
}

/**
 * Catálogo de etapas del embudo (SGRH-61). Se agrupa por columna del
 * tablero porque esa es la decisión que importa al crearlas: una etapa no
 * significa nada sin saber en qué parte del proceso cae.
 */
export function EtapasSeleccionManager({ etapas, canWrite }: EtapasSeleccionManagerProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<EtapaSeleccionRow>(deleteEtapaSeleccion)

  const router = useRouter()
  const [movingId, setMovingId] = useState<number | null>(null)

  const isEditing = editing !== null && editing !== 'new'

  async function mover(etapa: EtapaSeleccionRow, direccion: 'arriba' | 'abajo') {
    setMovingId(etapa.id)
    const result = await moveEtapaSeleccion(etapa.id, direccion)
    setMovingId(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  async function handleConfirmDelete() {
    const result = await confirmDelete()
    if (result.ok) toast.success('Etapa eliminada.')
  }

  return (
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Etapas del proceso de selección</h2>
          <p className="text-xs text-slate-500">
            Las etapas por las que pasa un candidato. Defina las que realmente usa la empresa: son
            las únicas que van a aparecer al avanzar una postulación.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Crear etapa
          </Button>
        )}
      </div>

      {deleteError && (
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      {etapas.length === 0 ? (
        <EmptyState
          icon={Milestone}
          title="Todavía no hay etapas definidas"
          description="Hasta que crees la primera, el tablero funciona igual pero no se puede registrar por qué etapas pasó cada candidato."
          action={
            canWrite && (
              <Button onClick={() => setEditing('new')} className="mt-1">
                <Plus className="h-3.5 w-3.5" /> Crear la primera etapa
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {FASES_SELECCION.map((fase) => {
            const deLaFase = etapas.filter((etapa) => etapa.fase === fase.value)

            return (
              <div key={fase.value} className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold text-slate-700">
                  {fase.label}
                  <span className="ml-1.5 font-medium text-slate-500">({deLaFase.length})</span>
                </h3>

                {deLaFase.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Sin etapas en esta columna.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {deLaFase.map((etapa, index) => (
                      <div
                        key={etapa.id}
                        className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-brand-300 ${
                          deletingId === etapa.id || movingId === etapa.id ? 'opacity-50' : ''
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-6 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: etapa.color ?? '#e2e8f0' }}
                        />
                        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
                          {etapa.nombre}
                        </p>
                        {canWrite && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            {/* Orden dentro de la columna = orden en el selector de
                                "Avanzar a etapa". Solo se muestra si hay a dónde mover. */}
                            {deLaFase.length > 1 && (
                              <>
                                <IconButton
                                  onClick={() => mover(etapa, 'arriba')}
                                  disabled={index === 0 || movingId !== null}
                                  aria-label={`Subir ${etapa.nombre}`}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton
                                  onClick={() => mover(etapa, 'abajo')}
                                  disabled={index === deLaFase.length - 1 || movingId !== null}
                                  aria-label={`Bajar ${etapa.nombre}`}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </IconButton>
                              </>
                            )}
                            <IconButton
                              tone="blue"
                              onClick={() => setEditing(etapa)}
                              aria-label={`Editar ${etapa.nombre}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              tone="rose"
                              onClick={() => requestDelete(etapa.id)}
                              disabled={deletingId === etapa.id}
                              aria-label={`Eliminar ${etapa.nombre}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing !== null && (
        <Modal
          title={isEditing ? `Editar etapa: ${editing.nombre}` : 'Crear etapa'}
          subtitle={
            isEditing
              ? 'Actualice el nombre, la columna del tablero o el color.'
              : 'Las etapas nuevas aparecen de inmediato al avanzar una postulación.'
          }
          onClose={() => setEditing(null)}
        >
          <EtapaSeleccionForm
            key={isEditing ? editing.id : 'new'}
            etapa={isEditing ? editing : undefined}
            onSuccess={() => {
              toast.success(isEditing ? 'Etapa actualizada.' : 'Etapa creada.')
              setEditing(null)
            }}
          />
        </Modal>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar etapa"
          message="La etapa dejará de aparecer al avanzar postulaciones. Si ya la recorrió algún candidato se desactivará, para no perder su historial."
          onCancel={cancelDelete}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}
