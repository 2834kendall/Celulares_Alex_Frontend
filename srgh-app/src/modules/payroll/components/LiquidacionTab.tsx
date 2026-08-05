'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import {
  procesarLiquidacionSchema,
  type EmpleadoActivoItem,
  type LiquidacionCalculada,
  type LiquidacionListItem,
  type MotivoSalidaRow,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'
import { formatCRC } from '@/modules/payroll/lib/format'
import { procesarLiquidacion } from '@/modules/payroll/actions/procesarLiquidacion'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'

interface LiquidacionTabProps {
  empleados: EmpleadoActivoItem[]
  motivos: MotivoSalidaRow[]
  historial: LiquidacionListItem[]
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

function ResultadoLinea({ label, valor, dias }: { label: string; valor: number; dias?: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-slate-600">
        {label}
        {dias !== undefined && <span className="text-slate-400"> ({dias} días)</span>}
      </span>
      <span className="tabular-nums font-medium text-slate-800">{formatCRC(valor)}</span>
    </div>
  )
}

/**
 * Calcula y guarda la liquidación de un empleado. Al confirmarse, cierra su
 * expediente laboral (fecha de fin + motivo de salida) — por eso no se
 * puede deshacer desde acá ni volver a procesar el mismo contrato dos veces.
 */
export function LiquidacionTab({ empleados, motivos, historial }: LiquidacionTabProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<LiquidacionCalculada | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProcesarLiquidacionInput>({
    resolver: zodResolver(procesarLiquidacionSchema),
    defaultValues: {
      historialLaboralId: undefined,
      fechaSalida: '',
      motivoSalidaId: undefined,
      diasVacacionesPendientes: 0,
    },
  })

  const motivoElegidoId = watch('motivoSalidaId')
  const motivoElegido = motivos.find((m) => m.mot_id === motivoElegidoId)

  async function onSubmit(input: ProcesarLiquidacionInput) {
    setServerError(null)
    setResultado(null)
    const result = await procesarLiquidacion(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    setResultado(result.data)
    toast.success('Liquidación calculada y guardada.')
    reset()
    router.refresh()
  }

  if (empleados.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          No hay empleados activos para liquidar.
        </p>
        <LiquidacionesHistorial items={historial} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          noValidate
        >
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <div>{serverError}</div>
            </div>
          )}

          <div>
            <label className={LABEL_CLASSES} htmlFor="historialLaboralId">
              Empleado
            </label>
            <select
              id="historialLaboralId"
              disabled={isSubmitting}
              aria-invalid={!!errors.historialLaboralId}
              {...register('historialLaboralId', { valueAsNumber: true })}
              className={INPUT_CLASSES}
              defaultValue=""
            >
              <option value="" disabled>
                Elegí un empleado
              </option>
              {empleados.map((e) => (
                <option key={e.historialLaboralId} value={e.historialLaboralId}>
                  {e.nombre} — {e.cedula}
                </option>
              ))}
            </select>
            {errors.historialLaboralId && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.historialLaboralId.message}</p>
            )}
          </div>

          <div>
            <label className={LABEL_CLASSES} htmlFor="fechaSalida">
              Fecha de salida
            </label>
            <input
              id="fechaSalida"
              type="date"
              disabled={isSubmitting}
              aria-invalid={!!errors.fechaSalida}
              {...register('fechaSalida')}
              className={INPUT_CLASSES}
            />
            {errors.fechaSalida && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.fechaSalida.message}</p>
            )}
          </div>

          <div>
            <label className={LABEL_CLASSES} htmlFor="motivoSalidaId">
              Motivo de salida
            </label>
            <select
              id="motivoSalidaId"
              disabled={isSubmitting}
              aria-invalid={!!errors.motivoSalidaId}
              {...register('motivoSalidaId', { valueAsNumber: true })}
              className={INPUT_CLASSES}
              defaultValue=""
            >
              <option value="" disabled>
                Elegí un motivo
              </option>
              {motivos.map((m) => (
                <option key={m.mot_id} value={m.mot_id}>
                  {m.mot_nombre}
                </option>
              ))}
            </select>
            {errors.motivoSalidaId && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.motivoSalidaId.message}</p>
            )}
            {motivoElegido && (
              <p className="mt-1 text-[11px] text-slate-400">
                {motivoElegido.mot_genera_cesantia ? 'Genera cesantía. ' : 'No genera cesantía. '}
                {motivoElegido.mot_genera_preaviso ? 'Genera preaviso.' : 'No genera preaviso.'}
                {motivoElegido.mot_nota_legal && ` ${motivoElegido.mot_nota_legal}`}
              </p>
            )}
          </div>

          <div>
            <label className={LABEL_CLASSES} htmlFor="diasVacacionesPendientes">
              Días de vacaciones pendientes
            </label>
            <input
              id="diasVacacionesPendientes"
              type="number"
              step="0.5"
              disabled={isSubmitting}
              aria-invalid={!!errors.diasVacacionesPendientes}
              {...register('diasVacacionesPendientes', { valueAsNumber: true })}
              className={INPUT_CLASSES}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              El sistema todavía no lleva el control de vacaciones tomadas: ingresá el saldo a mano.
            </p>
            {errors.diasVacacionesPendientes && (
              <p className="mt-1 text-[11px] text-rose-600">
                {errors.diasVacacionesPendientes.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando
              </>
            ) : (
              <>
                <Receipt className="h-3.5 w-3.5" /> Calcular y guardar liquidación
              </>
            )}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Resultado
          </p>
          {!resultado ? (
            <p className="text-xs text-slate-400">
              El desglose aparece acá después de calcular una liquidación.
            </p>
          ) : (
            <div>
              <ResultadoLinea label="Salario proporcional" valor={resultado.salarioProporcional} />
              <ResultadoLinea
                label="Aguinaldo proporcional"
                valor={resultado.aguinaldoProporcional}
              />
              <ResultadoLinea
                label="Vacaciones no disfrutadas"
                valor={resultado.vacacionesPagadas}
              />
              <ResultadoLinea
                label="Preaviso"
                valor={resultado.preaviso}
                dias={resultado.diasPreaviso}
              />
              <ResultadoLinea
                label="Cesantía"
                valor={resultado.cesantia}
                dias={resultado.diasCesantia}
              />
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                <span>Total</span>
                <span className="tabular-nums">{formatCRC(resultado.total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <LiquidacionesHistorial items={historial} />
    </div>
  )
}
