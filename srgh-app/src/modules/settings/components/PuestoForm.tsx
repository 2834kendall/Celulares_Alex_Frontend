'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Briefcase, Loader2 } from 'lucide-react'
import { puestoSchema, type PuestoInput, type PuestoRow } from '@/modules/settings/types'
import { createPuesto } from '@/modules/settings/actions/createPuesto'
import { updatePuesto } from '@/modules/settings/actions/updatePuesto'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface PuestoFormProps {
  /** Si se pasa un puesto existente, el formulario entra en modo edicion. */
  puesto?: PuestoRow
  onSuccess?: () => void
}

export function PuestoForm({ puesto, onSuccess }: PuestoFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(puesto)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PuestoInput>({
    resolver: zodResolver(puestoSchema),
    defaultValues: puesto
      ? {
          pue_nombre: puesto.pue_nombre,
          pue_descripcion: puesto.pue_descripcion ?? '',
          pue_salario_minimo_referencia: puesto.pue_salario_minimo_referencia?.toString() ?? '',
          pue_activo: puesto.pue_activo,
        }
      : {
          pue_nombre: '',
          pue_descripcion: '',
          pue_salario_minimo_referencia: '',
          pue_activo: true,
        },
  })

  async function onSubmit(input: PuestoInput) {
    setServerError(null)

    const result = isEditing ? await updatePuesto(puesto!.pue_id, input) : await createPuesto(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/settings') en el server action ya refresca la ruta.
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
        <label className={LABEL} htmlFor="pue_nombre">
          Nombre
        </label>
        <input
          id="pue_nombre"
          disabled={isSubmitting}
          aria-invalid={!!errors.pue_nombre}
          {...register('pue_nombre')}
          className={INPUT}
          placeholder="Cajero"
        />
        {errors.pue_nombre && <p className={FIELD_ERROR}>{errors.pue_nombre.message}</p>}
      </div>

      <div>
        <label className={LABEL} htmlFor="pue_descripcion">
          Descripción
        </label>
        <input
          id="pue_descripcion"
          disabled={isSubmitting}
          aria-invalid={!!errors.pue_descripcion}
          {...register('pue_descripcion')}
          className={INPUT}
          placeholder="Opcional"
        />
        {errors.pue_descripcion && <p className={FIELD_ERROR}>{errors.pue_descripcion.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
        <div>
          <label className={LABEL} htmlFor="pue_salario_minimo_referencia">
            Salario mínimo de referencia
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            id="pue_salario_minimo_referencia"
            disabled={isSubmitting}
            aria-invalid={!!errors.pue_salario_minimo_referencia}
            {...register('pue_salario_minimo_referencia')}
            className={`${INPUT} tabular-nums`}
            placeholder="Sin definir"
          />
          {errors.pue_salario_minimo_referencia && (
            <p className={FIELD_ERROR}>{errors.pue_salario_minimo_referencia.message}</p>
          )}
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register('pue_activo')}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40"
          />
          Puesto activo
        </label>
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Briefcase className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar puesto' : 'Crear puesto'}
          </>
        )}
      </Button>
    </form>
  )
}
