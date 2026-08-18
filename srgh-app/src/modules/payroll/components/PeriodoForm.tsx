'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  crearPeriodoSchema,
  type CatalogoItem,
  type CrearPeriodoInput,
} from '@/modules/payroll/types'
import { createPeriodo } from '@/modules/payroll/actions/createPeriodo'
import { MESES } from '@/modules/payroll/lib/format'
import { Button } from '@/components/ui/Button'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { ControlledDateField } from '@/components/ui/ControlledDateField'
import { ControlledSelectMenu, parseNumber } from '@/components/ui/SelectMenu'

const ERROR_CLASSES = 'mt-1 text-[11px] font-medium text-rose-600'

interface PeriodoFormProps {
  sucursales: CatalogoItem[]
}

/** Alta de un periodo de planilla (nace en estado 'borrador'). */
export function PeriodoForm({ sucursales }: PeriodoFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const hoy = new Date()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CrearPeriodoInput>({
    resolver: zodResolver(crearPeriodoSchema) as Resolver<CrearPeriodoInput>,
    mode: 'onTouched',
    defaultValues: {
      npe_periodo_mes: hoy.getMonth() + 1,
      npe_periodo_anio: hoy.getFullYear(),
      npe_quincena: hoy.getDate() <= 15 ? 1 : 2,
      npe_observaciones: '',
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await createPeriodo(values)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success('Periodo de nómina creado.')
    router.push(`/payroll/${result.periodoId}`)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p>{serverError}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="npe_sucursal_id" className={LABEL}>
              Sucursal
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_sucursal_id"
              id="npe_sucursal_id"
              parse={parseNumber}
              placeholder="Selecciona una sucursal"
              invalid={!!errors.npe_sucursal_id}
              options={sucursales.map((s) => ({ value: String(s.id), label: s.nombre }))}
            />
            {errors.npe_sucursal_id && (
              <p className={ERROR_CLASSES}>{errors.npe_sucursal_id.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_mes" className={LABEL}>
              Mes
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_periodo_mes"
              id="npe_periodo_mes"
              parse={parseNumber}
              invalid={!!errors.npe_periodo_mes}
              options={MESES.map((mes, index) => ({ value: String(index + 1), label: mes }))}
            />
            {errors.npe_periodo_mes && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_mes.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_anio" className={LABEL}>
              Año
            </label>
            <input
              id="npe_periodo_anio"
              type="number"
              {...register('npe_periodo_anio', { valueAsNumber: true })}
              className={INPUT}
            />
            {errors.npe_periodo_anio && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_anio.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_quincena" className={LABEL}>
              Quincena
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_quincena"
              id="npe_quincena"
              parse={parseNumber}
              invalid={!!errors.npe_quincena}
              options={[
                { value: '1', label: '1ª quincena' },
                { value: '2', label: '2ª quincena' },
              ]}
            />
            {errors.npe_quincena && <p className={ERROR_CLASSES}>{errors.npe_quincena.message}</p>}
          </div>

          <div>
            <label htmlFor="npe_fecha_inicio_periodo" className={LABEL}>
              Inicio del periodo
            </label>
            <ControlledDateField
              control={control}
              name="npe_fecha_inicio_periodo"
              id="npe_fecha_inicio_periodo"
              label="Inicio del periodo"
              invalid={!!errors.npe_fecha_inicio_periodo}
            />
            {errors.npe_fecha_inicio_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_inicio_periodo.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_fecha_fin_periodo" className={LABEL}>
              Fin del periodo
            </label>
            <ControlledDateField
              control={control}
              name="npe_fecha_fin_periodo"
              id="npe_fecha_fin_periodo"
              label="Fin del periodo"
              invalid={!!errors.npe_fecha_fin_periodo}
            />
            {errors.npe_fecha_fin_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_fin_periodo.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="npe_observaciones" className={LABEL}>
              Observaciones <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="npe_observaciones"
              rows={3}
              {...register('npe_observaciones')}
              className={INPUT}
              placeholder="Notas internas del periodo…"
            />
            {errors.npe_observaciones && (
              <p className={ERROR_CLASSES}>{errors.npe_observaciones.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/payroll')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Cancelar
        </button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className={SPINNER} />}
          Crear periodo
        </Button>
      </div>
    </form>
  )
}
