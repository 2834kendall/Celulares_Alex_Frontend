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

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10'
const LABEL_CLASSES = 'mb-1 block text-xs font-semibold text-slate-700'
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
            <label htmlFor="npe_sucursal_id" className={LABEL_CLASSES}>
              Sucursal
            </label>
            <select
              id="npe_sucursal_id"
              {...register('npe_sucursal_id', { valueAsNumber: true })}
              defaultValue=""
              className={INPUT_CLASSES}
            >
              <option value="" disabled>
                Selecciona una sucursal
              </option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            {errors.npe_sucursal_id && (
              <p className={ERROR_CLASSES}>{errors.npe_sucursal_id.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_mes" className={LABEL_CLASSES}>
              Mes
            </label>
            <select
              id="npe_periodo_mes"
              {...register('npe_periodo_mes', { valueAsNumber: true })}
              className={INPUT_CLASSES}
            >
              {MESES.map((mes, index) => (
                <option key={mes} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
            {errors.npe_periodo_mes && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_mes.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_anio" className={LABEL_CLASSES}>
              Año
            </label>
            <input
              id="npe_periodo_anio"
              type="number"
              {...register('npe_periodo_anio', { valueAsNumber: true })}
              className={INPUT_CLASSES}
            />
            {errors.npe_periodo_anio && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_anio.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_quincena" className={LABEL_CLASSES}>
              Quincena
            </label>
            <select
              id="npe_quincena"
              {...register('npe_quincena', { valueAsNumber: true })}
              className={INPUT_CLASSES}
            >
              <option value={1}>1ª quincena</option>
              <option value={2}>2ª quincena</option>
            </select>
            {errors.npe_quincena && <p className={ERROR_CLASSES}>{errors.npe_quincena.message}</p>}
          </div>

          <div>
            <label htmlFor="npe_fecha_inicio_periodo" className={LABEL_CLASSES}>
              Inicio del periodo
            </label>
            <input
              id="npe_fecha_inicio_periodo"
              type="date"
              {...register('npe_fecha_inicio_periodo')}
              className={INPUT_CLASSES}
            />
            {errors.npe_fecha_inicio_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_inicio_periodo.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_fecha_fin_periodo" className={LABEL_CLASSES}>
              Fin del periodo
            </label>
            <input
              id="npe_fecha_fin_periodo"
              type="date"
              {...register('npe_fecha_fin_periodo')}
              className={INPUT_CLASSES}
            />
            {errors.npe_fecha_fin_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_fin_periodo.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="npe_observaciones" className={LABEL_CLASSES}>
              Observaciones <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="npe_observaciones"
              rows={3}
              {...register('npe_observaciones')}
              className={INPUT_CLASSES}
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
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Crear periodo
        </button>
      </div>
    </form>
  )
}
