'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, Info, Loader2, Save, TrendingDown, TrendingUp } from 'lucide-react'
import {
  editarDetalleSchema,
  type EditarDetalleInput,
  type DetalleNominaItem,
  type ConceptoNominaRow,
} from '@/modules/payroll/types'
import { updateDetalleManual } from '@/modules/payroll/actions/updateDetalleManual'
import { Button } from '@/components/ui/Button'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

interface DetalleEditFormProps {
  detalle: DetalleNominaItem
  /** Conceptos activos tipo monto_manual_ingreso / monto_manual_deduccion (uno por input). */
  conceptosManuales: ConceptoNominaRow[]
  onSuccess?: () => void
  onCancel?: () => void
}

// Nota: "carga patronal" existe en el catálogo (con_tipo = 'patronal') pero
// no está conectada al motor de cálculo (siempre queda en ₡0) — por eso no
// tiene sección aquí. Los conceptos ya creados con ese tipo simplemente no
// aparecen para editar; no se borran del catálogo.

/** Agrupación visual de los conceptos manuales: cada tipo tiene su propia sección con color e icono. */
const SECCION_CONFIG = {
  ingreso: {
    label: 'Ingresos',
    hint: 'Suman al salario bruto',
    icon: TrendingUp,
    badge: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-700',
  },
  deduccion: {
    label: 'Deducciones',
    hint: 'Restan del salario neto',
    icon: TrendingDown,
    badge: 'bg-rose-50 text-rose-600',
    text: 'text-rose-700',
  },
} as const

const SECCION_ORDEN = ['ingreso', 'deduccion'] as const

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

  const grupos = SECCION_ORDEN.map((tipo) => ({
    tipo,
    items: conceptosManuales.filter((c) => c.con_tipo === tipo),
  })).filter((g) => g.items.length > 0)

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
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      {conceptosManuales.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No hay conceptos manuales activos en el catálogo (tipo &quot;monto manual&quot;). Crea al
          menos uno en &quot;Conceptos de nómina&quot; para poder cargar montos aquí.
        </p>
      ) : (
        <div className="space-y-3">
          {grupos.map(({ tipo, items }) => {
            const config = SECCION_CONFIG[tipo]
            const Icon = config.icon
            return (
              <div key={tipo} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${config.badge}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <h4 className={`text-xs font-bold ${config.text}`}>{config.label}</h4>
                  <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">
                    {config.hint}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((concepto) => (
                    <div key={concepto.con_id}>
                      <label
                        className={LABEL}
                        htmlFor={`monto-${detalle.id}-${concepto.con_codigo}`}
                      >
                        {concepto.con_nombre}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                          ₡
                        </span>
                        <input
                          id={`monto-${detalle.id}-${concepto.con_codigo}`}
                          type="number"
                          step="0.01"
                          disabled={isSubmitting}
                          aria-invalid={!!errors.montos?.[concepto.con_codigo]}
                          {...register(`montos.${concepto.con_codigo}`, { valueAsNumber: true })}
                          className={`${INPUT} pl-6 pr-3`}
                        />
                      </div>
                      {errors.montos?.[concepto.con_codigo] && (
                        <p className="mt-1 text-[11px] text-rose-600">
                          {errors.montos[concepto.con_codigo]?.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Clock className="h-3.5 w-3.5" />
          </span>
          <h4 className="text-xs font-bold text-blue-700">Horas y tarifa</h4>
          <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">
            Base para calcular las horas extra automáticas
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 bg-white p-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`horas-${detalle.id}`}>
              Horas trabajadas (quincena)
            </label>
            <div className="relative">
              <input
                id={`horas-${detalle.id}`}
                type="number"
                step="0.01"
                disabled={isSubmitting}
                aria-invalid={!!errors.horasTrabajadas}
                {...register('horasTrabajadas', { valueAsNumber: true })}
                className={`${INPUT} pl-3 pr-7`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                h
              </span>
            </div>
            {errors.horasTrabajadas && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.horasTrabajadas.message}</p>
            )}
          </div>

          <div>
            <label className={LABEL} htmlFor={`salario-hora-${detalle.id}`}>
              Salario por hora
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                ₡
              </span>
              <input
                id={`salario-hora-${detalle.id}`}
                type="number"
                step="0.01"
                disabled={isSubmitting}
                aria-invalid={!!errors.salarioPorHora}
                {...register('salarioPorHora', { valueAsNumber: true })}
                className={`${INPUT} pl-6 pr-3`}
              />
            </div>
            {errors.salarioPorHora && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.salarioPorHora.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>
          Las horas extra (por encima del tope normal de la quincena) y las deducciones porcentuales
          (ej. CCSS) se calculan solas a partir de estos datos y del catálogo de conceptos.
        </p>
      </div>

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
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
