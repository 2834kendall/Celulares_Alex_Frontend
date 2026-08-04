'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  registrarIncapacidadSchema,
  type RegistrarIncapacidadInput,
} from '@/modules/payroll/types'
import { registrarIncapacidad } from '@/modules/payroll/actions/registrarIncapacidad'

interface RegistrarIncapacidadFormProps {
  historialLaboralId: number
  empleadoNombre: string
  onCancel: () => void
  onSuccess: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/**
 * Registra una incapacidad por enfermedad (INC_ENF) para el empleado del
 * periodo. El servidor reparte los días entre los periodos de nómina que se
 * traslapan con el rango de fechas, respetando el tope de 3 días pagados por
 * el patrono al mes.
 */
export function RegistrarIncapacidadForm({
  historialLaboralId,
  empleadoNombre,
  onCancel,
  onSuccess,
}: RegistrarIncapacidadFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof registrarIncapacidadSchema>, unknown, RegistrarIncapacidadInput>({
    resolver: zodResolver(registrarIncapacidadSchema),
    defaultValues: {
      historialLaboralId,
      fechaInicio: '',
      fechaFin: '',
      numeroBoletaCcss: '',
    },
  })

  async function onSubmit(input: RegistrarIncapacidadInput) {
    setServerError(null)
    const result = await registrarIncapacidad(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    if (result.periodosActualizados.length === 0) {
      toast.warning(
        'La incapacidad se guardó, pero ninguno de sus días cae en un periodo de nómina existente todavía.'
      )
    } else {
      const resumen = result.periodosActualizados
        .map((p) => `${p.periodoLabel}: ${p.diasEmpleador}d patrono / ${p.diasCcss}d CCSS`)
        .join(' · ')
      toast.success(`Incapacidad registrada. ${resumen}`)
      if (result.diasSinPeriodo > 0) {
        toast.warning(
          `${result.diasSinPeriodo} día(s) de esta incapacidad caen fuera de periodos ya creados y no se aplicaron todavía.`
        )
      }
    }

    router.refresh()
    onSuccess()
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"
      noValidate
    >
      <p className="text-xs font-bold text-slate-800">Registrar incapacidad — {empleadoNombre}</p>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{serverError}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASSES} htmlFor="fechaInicio">
            Fecha de inicio
          </label>
          <input
            id="fechaInicio"
            type="date"
            disabled={isSubmitting}
            aria-invalid={!!errors.fechaInicio}
            {...register('fechaInicio')}
            className={INPUT_CLASSES}
          />
          {errors.fechaInicio && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.fechaInicio.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="fechaFin">
            Fecha de fin
          </label>
          <input
            id="fechaFin"
            type="date"
            disabled={isSubmitting}
            aria-invalid={!!errors.fechaFin}
            {...register('fechaFin')}
            className={INPUT_CLASSES}
          />
          {errors.fechaFin && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.fechaFin.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="numeroBoletaCcss">
            Boleta CCSS <span className="font-normal normal-case text-slate-400">(opcional)</span>
          </label>
          <input
            id="numeroBoletaCcss"
            disabled={isSubmitting}
            {...register('numeroBoletaCcss')}
            className={INPUT_CLASSES}
            placeholder="N.° de boleta"
          />
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        Los primeros 3 días (por mes calendario) los paga la empresa al 50% del salario. Del día 4
        en adelante los paga la CCSS por fuera de esta planilla.
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
          Guardar incapacidad
        </button>
      </div>
    </form>
  )
}
