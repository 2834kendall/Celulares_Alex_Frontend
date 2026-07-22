'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import {
  editarDetalleSchema,
  type EditarDetalleInput,
  type DetalleNominaItem,
  type ConceptoNominaRow,
} from '@/modules/payroll/types'
import { updateDetalleManual } from '@/modules/payroll/actions/updateDetalleManual'

interface DetalleEditFormProps {
  detalle: DetalleNominaItem
  /** Conceptos activos tipo monto_manual_ingreso / monto_manual_deduccion (uno por input). */
  conceptosManuales: ConceptoNominaRow[]
  onSuccess?: () => void
  onCancel?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/**
 * Edición manual del detalle de un empleado dentro del periodo, sin volver a
 * subir el Excel: un input por cada concepto manual activo del catálogo
 * (con_tipo_calculo = monto_manual_ingreso / monto_manual_deduccion), más
 * horas trabajadas y salario por hora para el cálculo automático de horas
 * extra. Las deducciones porcentuales (ej. CCSS) y las horas extra nunca se
 * muestran como campo editable: siempre se recalculan en el servidor.
 */
export function DetalleEditForm({
  detalle,
  conceptosManuales,
  onSuccess,
  onCancel,
}: DetalleEditFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarDetalleInput>({
    resolver: zodResolver(editarDetalleSchema),
    defaultValues: {
      montos: Object.fromEntries(
        conceptosManuales.map((c) => [c.con_codigo, detalle.montosPorConcepto[c.con_codigo] ?? 0])
      ),
      horasTrabajadas: detalle.horasTrabajadas,
      salarioPorHora: detalle.salarioPorHora,
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

      {conceptosManuales.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No hay conceptos manuales activos en el catálogo (tipo &quot;monto manual&quot;). Crea al
          menos uno en &quot;Conceptos de nómina&quot; para poder cargar montos aquí.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {conceptosManuales.map((concepto) => (
            <div key={concepto.con_id}>
              <label
                className={LABEL_CLASSES}
                htmlFor={`monto-${detalle.id}-${concepto.con_codigo}`}
              >
                {concepto.con_nombre}
              </label>
              <input
                id={`monto-${detalle.id}-${concepto.con_codigo}`}
                type="number"
                step="0.01"
                disabled={isSubmitting}
                aria-invalid={!!errors.montos?.[concepto.con_codigo]}
                {...register(`montos.${concepto.con_codigo}`, { valueAsNumber: true })}
                className={INPUT_CLASSES}
              />
              {errors.montos?.[concepto.con_codigo] && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.montos[concepto.con_codigo]?.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={LABEL_CLASSES} htmlFor={`horas-${detalle.id}`}>
            Horas trabajadas (quincena)
          </label>
          <input
            id={`horas-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.horasTrabajadas}
            {...register('horasTrabajadas', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.horasTrabajadas && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.horasTrabajadas.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`salario-hora-${detalle.id}`}>
            Salario por hora
          </label>
          <input
            id={`salario-hora-${detalle.id}`}
            type="number"
            step="0.01"
            disabled={isSubmitting}
            aria-invalid={!!errors.salarioPorHora}
            {...register('salarioPorHora', { valueAsNumber: true })}
            className={INPUT_CLASSES}
          />
          {errors.salarioPorHora && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.salarioPorHora.message}</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Las horas extra (por encima del tope normal de la quincena) y las deducciones porcentuales
        (ej. CCSS) se calculan solas a partir de estos datos y del catálogo de conceptos.
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
