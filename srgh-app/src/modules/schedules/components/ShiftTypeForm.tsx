'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Layers, Loader2 } from 'lucide-react'
import { shiftTypeSchema, type ShiftTypeInput, type ShiftTypeRow } from '@/modules/schedules/types'
import { createShiftType } from '@/modules/schedules/actions/createShiftType'
import { updateShiftType } from '@/modules/schedules/actions/updateShiftType'

interface ShiftTypeFormProps {
  /** Si viene un tipo de jornada existente, el form entra en modo edicion. */
  shiftType?: ShiftTypeRow
  onSuccess?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

export function ShiftTypeForm({ shiftType, onSuccess }: ShiftTypeFormProps) {
  const router = useRouter()
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

    router.refresh()
    onSuccess?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{serverError}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASSES} htmlFor="tjo_codigo">
            Código
          </label>
          <input
            id="tjo_codigo"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_codigo}
            {...register('tjo_codigo')}
            className={`${INPUT_CLASSES} uppercase`}
            placeholder="JORNADA_MIXTA"
          />
          {errors.tjo_codigo && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.tjo_codigo.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="tjo_nombre">
            Nombre
          </label>
          <input
            id="tjo_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.tjo_nombre}
            {...register('tjo_nombre')}
            className={INPUT_CLASSES}
            placeholder="Jornada Mixta"
          />
          {errors.tjo_nombre && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.tjo_nombre.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASSES} htmlFor="tjo_horas_max_diarias">
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
            className={`${INPUT_CLASSES} tabular-nums`}
            placeholder="Sin límite"
          />
          {errors.tjo_horas_max_diarias && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.tjo_horas_max_diarias.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="tjo_horas_max_semanales">
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
            className={`${INPUT_CLASSES} tabular-nums`}
            placeholder="Sin límite"
          />
          {errors.tjo_horas_max_semanales && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.tjo_horas_max_semanales.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="tjo_recargo_porcentaje">
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
            className={`${INPUT_CLASSES} tabular-nums`}
          />
          {errors.tjo_recargo_porcentaje && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.tjo_recargo_porcentaje.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
          </>
        ) : (
          <>
            <Layers className="h-3.5 w-3.5" />{' '}
            {isEditing ? 'Actualizar tipo de jornada' : 'Crear tipo de jornada'}
          </>
        )}
      </button>
    </form>
  )
}
