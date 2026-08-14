'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ClipboardList, Loader2 } from 'lucide-react'
import { rubroSchema, type RubroInput, type RubroRow } from '@/modules/evaluations/types'
import { createRubro } from '@/modules/evaluations/actions/createRubro'
import { updateRubro } from '@/modules/evaluations/actions/updateRubro'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface RubroFormProps {
  // Si se pasa un rubro existente, el formulario entra en modo edicion.
  rubro?: RubroRow
  onSuccess?: () => void
}

export function RubroForm({ rubro, onSuccess }: RubroFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(rubro)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RubroInput>({
    resolver: zodResolver(rubroSchema),
    defaultValues: rubro
      ? { nombre: rubro.nombre, descripcion: rubro.descripcion }
      : { nombre: '', descripcion: '' },
  })

  async function onSubmit(input: RubroInput) {
    setServerError(null)

    const result = isEditing
      ? await updateRubro(rubro!.areaId, rubro!.criterioId, input)
      : await createRubro(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/evaluations') en la accion ya refresca la ruta.
    if (!isEditing) reset({ nombre: '', descripcion: '' })
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div>
        <label className={LABEL} htmlFor="rubro_nombre">
          Nombre del rubro
        </label>
        <input
          id="rubro_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.nombre}
          {...register('nombre')}
          className={INPUT}
          placeholder="Ej: Proactividad en Tienda"
        />
        {errors.nombre && <p className={FIELD_ERROR}>{errors.nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="rubro_descripcion">
          Descripción corta
        </label>
        <textarea
          id="rubro_descripcion"
          rows={3}
          disabled={isSubmitting}
          aria-invalid={!!errors.descripcion}
          {...register('descripcion')}
          className={`${INPUT} resize-none`}
          placeholder="Defina qué se evalúa con este indicador..."
        />
        {errors.descripcion && <p className={FIELD_ERROR}>{errors.descripcion.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <ClipboardList className="h-3.5 w-3.5" />{' '}
            {isEditing ? 'Actualizar rubro' : 'Guardar rubro'}
          </>
        )}
      </Button>
    </form>
  )
}
