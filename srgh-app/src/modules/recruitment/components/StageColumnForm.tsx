'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import {
  stageColumnSchema,
  type EtapaSeleccionItem,
  type StageColumnInput,
} from '@/modules/recruitment/types'
import { createEtapaSeleccion } from '@/modules/recruitment/actions/createEtapaSeleccion'
import { updateEtapaSeleccion } from '@/modules/recruitment/actions/updateEtapaSeleccion'
import { deleteEtapaSeleccion } from '@/modules/recruitment/actions/deleteEtapaSeleccion'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Alert } from '@/components/ui/Alert'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'

interface StageColumnFormProps {
  /** Con columna = editar; sin columna = crear una nueva al final. */
  stage?: EtapaSeleccionItem
  /** Candidatos que tiene hoy la columna: decide si se puede eliminar. */
  cardCount?: number
  onDone: () => void
}

/**
 * Alta y edición de una columna del tablero (una etapa del proceso).
 *
 * No pide "en qué columna va" ni el orden: la columna ES la etapa, y el
 * orden se cambia arrastrando el encabezado. Eliminar vive acá, dentro de la
 * edición, para que no haya un botón destructivo suelto en cada encabezado.
 */
export function StageColumnForm({ stage, cardCount = 0, onDone }: StageColumnFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isEditing = Boolean(stage)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StageColumnInput>({
    resolver: zodResolver(stageColumnSchema),
    defaultValues: stage
      ? { nombre: stage.nombre, color: stage.color }
      : { nombre: '', color: null },
  })

  const colorValue = useWatch({ control, name: 'color' })
  const busy = isSubmitting || deleting

  async function onSubmit(input: StageColumnInput) {
    setServerError(null)
    const result = stage
      ? await updateEtapaSeleccion(stage.id, input)
      : await createEtapaSeleccion(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success(isEditing ? 'Columna actualizada.' : 'Columna creada.')
    onDone()
  }

  async function handleDelete() {
    if (!stage) return
    setConfirmingDelete(false)
    setDeleting(true)
    setServerError(null)
    const result = await deleteEtapaSeleccion(stage.id)
    setDeleting(false)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success('Columna eliminada.')
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div>
        <label className={LABEL} htmlFor="stage_column_name">
          Nombre de la columna
        </label>
        <input
          id="stage_column_name"
          disabled={busy}
          aria-invalid={!!errors.nombre}
          {...register('nombre')}
          className={INPUT}
          placeholder="Ej: Entrevista con el encargado"
          autoFocus={!isEditing}
        />
        {errors.nombre && <p className={FIELD_ERROR}>{errors.nombre.message}</p>}
      </div>

      <ColorPicker
        value={colorValue}
        disabled={busy}
        onChange={(color) => setValue('color', color, { shouldDirty: true })}
        label="Color"
        description="Marca el encabezado de la columna para reconocerla de un vistazo."
        emptyLabel="Sin color"
        storageKey="sgrh_etapas_custom_colors"
      />

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        {isEditing ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            // Con candidatos adentro no se elimina: el servidor también lo
            // rechaza, pero avisarlo antes ahorra el intento.
            disabled={busy || cardCount > 0}
            title={cardCount > 0 ? 'Mové primero a los candidatos de esta columna' : undefined}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-rose-600 outline-none transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent pointer-coarse:min-h-11"
          >
            {deleting ? <Loader2 className={SPINNER} /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar columna
          </button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy} size="lg">
          {isSubmitting && <Loader2 className={SPINNER} />}
          {isEditing ? 'Guardar cambios' : 'Crear columna'}
        </Button>
      </div>

      {isEditing && cardCount > 0 && (
        <p className="text-[11px] text-slate-500">
          Para eliminarla, mové primero{' '}
          {cardCount === 1 ? 'al candidato' : `a los ${cardCount} candidatos`} que tiene a otra
          columna.
        </p>
      )}

      {confirmingDelete && stage && (
        <ConfirmDialog
          title="Eliminar columna"
          message={`"${stage.nombre}" dejará de aparecer en el tablero. El historial de los candidatos que pasaron por ella se conserva.`}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </form>
  )
}
