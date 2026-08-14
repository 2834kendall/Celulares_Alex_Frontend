'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { registrarIncapacidadSchema, type RegistrarIncapacidadInput } from '@/modules/payroll/types'
import { registrarIncapacidad } from '@/modules/payroll/actions/registrarIncapacidad'
import { Button } from '@/components/ui/Button'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface RegistrarIncapacidadFormProps {
  historialLaboralId: number
  empleadoNombre: string
  onCancel: () => void
  onSuccess: () => void
}

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
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="fechaInicio">
            Fecha de inicio
          </label>
          <input
            id="fechaInicio"
            type="date"
            disabled={isSubmitting}
            aria-invalid={!!errors.fechaInicio}
            {...register('fechaInicio')}
            className={INPUT}
          />
          {errors.fechaInicio && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.fechaInicio.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="fechaFin">
            Fecha de fin
          </label>
          <input
            id="fechaFin"
            type="date"
            disabled={isSubmitting}
            aria-invalid={!!errors.fechaFin}
            {...register('fechaFin')}
            className={INPUT}
          />
          {errors.fechaFin && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.fechaFin.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="numeroBoletaCcss">
            Boleta CCSS <span className="font-normal normal-case text-slate-400">(opcional)</span>
          </label>
          <input
            id="numeroBoletaCcss"
            disabled={isSubmitting}
            {...register('numeroBoletaCcss')}
            className={INPUT}
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className={SPINNER} /> : <Save className="h-3.5 w-3.5" />}
          Guardar incapacidad
        </Button>
      </div>
    </form>
  )
}
