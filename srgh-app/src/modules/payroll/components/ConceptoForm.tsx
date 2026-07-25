'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { AlertTriangle, Coins, Loader2 } from 'lucide-react'
import {
  conceptoNominaSchema,
  CONCEPTO_TIPOS,
  TIPOS_CALCULO_CONCEPTO,
  type ConceptoNominaInput,
  type ConceptoNominaRow,
  type TipoCalculoConcepto,
} from '@/modules/payroll/types'
import { createConcepto } from '@/modules/payroll/actions/createConcepto'
import { updateConcepto } from '@/modules/payroll/actions/updateConcepto'

interface ConceptoFormProps {
  /** Si se pasa un concepto existente, el formulario entra en modo edición. */
  concepto?: ConceptoNominaRow
  onSuccess?: () => void
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

const TIPO_LABELS: Record<(typeof CONCEPTO_TIPOS)[number], string> = {
  ingreso: 'Ingreso',
  deduccion: 'Deducción',
  patronal: 'Carga patronal',
}

const TIPO_CALCULO_LABELS: Record<TipoCalculoConcepto, string> = {
  monto_manual_ingreso: 'Monto manual — suma al bruto (ej. Comisión)',
  monto_manual_deduccion: 'Monto manual — resta del neto (ej. préstamo)',
  porcentaje_deduccion_bruto: '% del salario bruto — se resta (ej. CCSS obrera)',
  horas_extra_automatico: 'Horas extra automáticas (el sistema las calcula)',
}

const TIPOS_CON_PORCENTAJE = new Set<TipoCalculoConcepto>([
  'porcentaje_deduccion_bruto',
  'horas_extra_automatico',
])

export function ConceptoForm({ concepto, onSuccess }: ConceptoFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(concepto)

  // Se usan los 3 genéricos de useForm (en vez de solo <ConceptoNominaInput>)
  // porque el schema normaliza algunos campos (con_formula_base) al validar:
  // los valores "en vivo" del formulario siguen el tipo de entrada del schema
  // (z.input), pero lo que llega a onSubmit ya viene normalizado según
  // ConceptoNominaInput (z.output). Si se usa un solo genérico, TypeScript
  // exige que ambos coincidan exactamente y el build falla.
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof conceptoNominaSchema>, unknown, ConceptoNominaInput>({
    resolver: zodResolver(conceptoNominaSchema),
    defaultValues: concepto
      ? {
          con_codigo: concepto.con_codigo,
          con_nombre: concepto.con_nombre,
          con_tipo: concepto.con_tipo as ConceptoNominaInput['con_tipo'],
          con_tipo_calculo: concepto.con_tipo_calculo as TipoCalculoConcepto,
          con_porcentaje: concepto.con_porcentaje,
          con_afecta_salario_bruto: concepto.con_afecta_salario_bruto,
          con_afecta_base_ccss: concepto.con_afecta_base_ccss,
          con_formula_base: concepto.con_formula_base ?? '',
          con_activo: concepto.con_activo,
        }
      : {
          con_codigo: '',
          con_nombre: '',
          con_tipo: 'ingreso',
          con_tipo_calculo: 'monto_manual_ingreso',
          con_porcentaje: null,
          con_afecta_salario_bruto: false,
          con_afecta_base_ccss: true,
          con_formula_base: '',
          con_activo: true,
        },
  })

  const tipoCalculo = watch('con_tipo_calculo')
  const requierePorcentaje = TIPOS_CON_PORCENTAJE.has(tipoCalculo)

  async function onSubmit(input: ConceptoNominaInput) {
    setServerError(null)

    const result = isEditing
      ? await updateConcepto(concepto!.con_id, input)
      : await createConcepto(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/payroll/concepts') en la server action ya refresca la ruta.
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
          <label className={LABEL_CLASSES} htmlFor="con_codigo">
            Código
          </label>
          <input
            id="con_codigo"
            disabled={isSubmitting}
            aria-invalid={!!errors.con_codigo}
            {...register('con_codigo')}
            className={`${INPUT_CLASSES} uppercase`}
            placeholder="BONO_ANUAL"
          />
          {errors.con_codigo && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.con_codigo.message}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor="con_nombre">
            Nombre
          </label>
          <input
            id="con_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.con_nombre}
            {...register('con_nombre')}
            className={INPUT_CLASSES}
            placeholder="Bono anual"
          />
          {errors.con_nombre && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.con_nombre.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="con_tipo">
          Tipo
        </label>
        <select
          id="con_tipo"
          disabled={isSubmitting}
          aria-invalid={!!errors.con_tipo}
          {...register('con_tipo')}
          className={INPUT_CLASSES}
        >
          {CONCEPTO_TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {TIPO_LABELS[tipo]}
            </option>
          ))}
        </select>
        {errors.con_tipo && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.con_tipo.message}</p>
        )}
      </div>

      <div>
        <label className={LABEL_CLASSES} htmlFor="con_tipo_calculo">
          Cómo se calcula
        </label>
        <select
          id="con_tipo_calculo"
          disabled={isSubmitting}
          aria-invalid={!!errors.con_tipo_calculo}
          {...register('con_tipo_calculo')}
          className={INPUT_CLASSES}
        >
          {TIPOS_CALCULO_CONCEPTO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {TIPO_CALCULO_LABELS[tipo]}
            </option>
          ))}
        </select>
        {errors.con_tipo_calculo && (
          <p className="mt-1.5 text-xs text-rose-600">{errors.con_tipo_calculo.message}</p>
        )}
      </div>

      {requierePorcentaje && (
        <div>
          <label className={LABEL_CLASSES} htmlFor="con_porcentaje">
            Porcentaje
          </label>
          <input
            id="con_porcentaje"
            type="number"
            step="0.001"
            disabled={isSubmitting}
            aria-invalid={!!errors.con_porcentaje}
            {...register('con_porcentaje', { valueAsNumber: true })}
            className={INPUT_CLASSES}
            placeholder={
              tipoCalculo === 'porcentaje_deduccion_bruto'
                ? 'ej. 10.83'
                : 'ej. 150 (tiempo y medio)'
            }
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {tipoCalculo === 'porcentaje_deduccion_bruto'
              ? 'Porcentaje del salario bruto que se resta.'
              : 'Multiplicador sobre el salario por hora de las horas que superen el tope normal (100% = una vez, 150% = tiempo y medio).'}
          </p>
          {errors.con_porcentaje && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.con_porcentaje.message}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register('con_afecta_salario_bruto')}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Afecta el salario bruto
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register('con_afecta_base_ccss')}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Afecta la base de CCSS
        </label>
      </div>

      {isEditing && (
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register('con_activo')}
            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Activo (disponible para nuevas planillas)
        </label>
      )}

      <div>
        <label className={LABEL_CLASSES} htmlFor="con_formula_base">
          Fórmula o nota <span className="font-normal normal-case text-slate-400">(opcional)</span>
        </label>
        <input
          id="con_formula_base"
          disabled={isSubmitting}
          {...register('con_formula_base')}
          className={INPUT_CLASSES}
          placeholder="Referencia interna, sin efecto en el cálculo automático"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
          </>
        ) : (
          <>
            <Coins className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar concepto' : 'Crear concepto'}
          </>
        )}
      </button>
    </form>
  )
}
