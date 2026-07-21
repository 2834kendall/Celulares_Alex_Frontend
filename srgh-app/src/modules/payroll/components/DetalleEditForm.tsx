'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import {
  editarDetalleSchema,
  type EditarDetalleInput,
  type DetalleNominaItem,
} from '@/modules/payroll/types'
import { updateDetalleManual } from '@/modules/payroll/actions/updateDetalleManual'

interface DetalleEditFormProps {
  detalle: DetalleNominaItem
  onSuccess?: () => void
  onCancel?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/**
 * Edición manual de los ingresos de un empleado (BASE, FERIADO, COMISION,
 * HORAS_EXTRA, AJUSTE), sin volver a subir el Excel. El rebajo de CCSS no se
 * muestra como campo editable: siempre se recalcula en el servidor a partir
 * de estos montos.
 */
export function DetalleEditForm({ detalle, onSuccess, onCancel }: DetalleEditFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarDetalleInput>({
    resolver: zodResolver(editarDetalleSchema),
    defaultValues: {
      base: detalle.base,
      feriado: detalle.feriado,
      comision: detalle.comision,
      horasExtra: detalle.horasExtra,
      ajuste: detalle.ajuste,
    },
  })

  async function onSubmit(input: EditarDetalleInput) {
    setServerError(null)
    const result = await updateDetalleManual(detalle.id, input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label className={LABEL_CLASSES} htmlFor={`base-${detalle.id}`}>
            Base
          </label>
          <input
            id={`base-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.base}
            {...register('base', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.base && <p className="mt-1 text-[11px] text-rose-600">{errors.base.message}</p>}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`feriado-${detalle.id}`}>
            Feriado
          </label>
          <input
            id={`feriado-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.feriado}
            {...register('feriado', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.feriado && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.feriado.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`comision-${detalle.id}`}>
            Comisión
          </label>
          <input
            id={`comision-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.comision}
            {...register('comision', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.comision && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.comision.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`horasExtra-${detalle.id}`}>
            Horas extra
          </label>
          <input
            id={`horasExtra-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.horasExtra}
            {...register('horasExtra', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.horasExtra && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.horasExtra.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`ajuste-${detalle.id}`}>
            Ajuste
          </label>
          <input
            id={`ajuste-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.ajuste}
            {...register('ajuste', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.ajuste && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.ajuste.message}</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        El rebajo de CCSS (10,83%) y los totales se recalculan solos a partir de estos montos.
      </p>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar cambios
        </button>
      </div>
    </form>
  )
}
