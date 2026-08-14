'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Layers, Loader2 } from 'lucide-react'
import { shiftTypeSchema, type ShiftTypeInput, type ShiftTypeRow } from '@/modules/schedules/types'
import { createShiftType } from '@/modules/schedules/actions/createShiftType'
import { updateShiftType } from '@/modules/schedules/actions/updateShiftType'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface ShiftTypeFormProps {
  /** If an existing shift type is passed, the form enters edit mode. */
  shiftType?: ShiftTypeRow
  onSuccess?: () => void
}

export function ShiftTypeForm({ shiftType, onSuccess }: ShiftTypeFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(shiftType)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ShiftTypeInput>({
    resolver: zodResolver(shiftTypeSchema),
    defaultValues: shiftType
      ? {
          tjo_codigo: shiftType.tjo_codigo,
          tjo_nombre: shiftType.tjo_nombre,
          tjo_horas_max_diarias: shiftType.tjo_horas_max_diarias?.toString() ?? '',
          tjo_horas_max_semanales: shiftType.tjo_horas_max_semanales?.toString() ?? '',
          tjo_recargo_porcentaje: shiftType.tjo_recargo_porcentaje,
        }
      : {
          tjo_codigo: '',
          tjo_nombre: '',
          tjo_horas_max_diarias: '',
          tjo_horas_max_semanales: '',
          tjo_recargo_porcentaje: 0,
        },
  })

  async function onSubmit(input: ShiftTypeInput) {
    setServerError(null)

    const result = isEditing
      ? await updateShiftType(shiftType!.tjo_id, input)
      : await createShiftType(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/schedule') in the server action already refreshes the route.
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="tjo_codigo">
            Código
          </label>
          <input
            id="tjo_codigo"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_codigo}
            {...register('tjo_codigo')}
            className={`${INPUT} uppercase`}
            placeholder="JORNADA_MIXTA"
          />
          {errors.tjo_codigo && <p className={FIELD_ERROR}>{errors.tjo_codigo.message}</p>}
        </div>

        <div>
          <label className={LABEL} htmlFor="tjo_nombre">
            Nombre
          </label>
          <input
            id="tjo_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_nombre}
            {...register('tjo_nombre')}
            className={INPUT}
            placeholder="Jornada Mixta"
          />
          {errors.tjo_nombre && <p className={FIELD_ERROR}>{errors.tjo_nombre.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="tjo_horas_max_diarias">
            Horas máx. diarias
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            id="tjo_horas_max_diarias"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_horas_max_diarias}
            {...register('tjo_horas_max_diarias')}
            className={`${INPUT} tabular-nums`}
            placeholder="Sin límite"
          />
          {errors.tjo_horas_max_diarias && (
            <p className={FIELD_ERROR}>{errors.tjo_horas_max_diarias.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="tjo_horas_max_semanales">
            Horas máx. semanales
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            id="tjo_horas_max_semanales"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_horas_max_semanales}
            {...register('tjo_horas_max_semanales')}
            className={`${INPUT} tabular-nums`}
            placeholder="Sin límite"
          />
          {errors.tjo_horas_max_semanales && (
            <p className={FIELD_ERROR}>{errors.tjo_horas_max_semanales.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="tjo_recargo_porcentaje">
            Recargo %
          </label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            id="tjo_recargo_porcentaje"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_recargo_porcentaje}
            {...register('tjo_recargo_porcentaje', { valueAsNumber: true })}
            className={`${INPUT} tabular-nums`}
          />
          {errors.tjo_recargo_porcentaje && (
            <p className={FIELD_ERROR}>{errors.tjo_recargo_porcentaje.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <Layers className="h-3.5 w-3.5" />{' '}
            {isEditing ? 'Actualizar tipo de jornada' : 'Crear tipo de jornada'}
          </>
        )}
      </Button>
    </form>
  )
}
