'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText, Loader2 } from 'lucide-react'
import {
  tipoAusenciaSchema,
  type AusenciaTypeRow,
  type TipoAusenciaInput,
} from '@/modules/absences/types'
import { createTipoAusencia } from '@/modules/absences/actions/createTipoAusencia'
import { updateTipoAusencia } from '@/modules/absences/actions/updateTipoAusencia'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FIELD_ERROR, INPUT, LABEL, SPINNER } from '@/components/ui/styles'

interface TipoAusenciaFormProps {
  // Si se pasa un tipo existente, el formulario entra en modo edicion.
  tipo?: AusenciaTypeRow
  onSuccess?: () => void
}

const CHECKBOX = 'mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40'

export function TipoAusenciaForm({ tipo, onSuccess }: TipoAusenciaFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isEditing = Boolean(tipo)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TipoAusenciaInput>({
    resolver: zodResolver(tipoAusenciaSchema),
    defaultValues: tipo
      ? {
          tau_codigo: tipo.tau_codigo,
          tau_nombre: tipo.tau_nombre,
          tau_requiere_documento_ccss: tipo.tau_requiere_documento_ccss,
          tau_paga_empleador_dias: tipo.tau_paga_empleador_dias,
          tau_porcentaje_pago_empleador: tipo.tau_porcentaje_pago_empleador,
          tau_paga_ccss_desde_dia: tipo.tau_paga_ccss_desde_dia ?? undefined,
          tau_porcentaje_subsidio_ccss: tipo.tau_porcentaje_subsidio_ccss ?? undefined,
          tau_descuenta_vacaciones: tipo.tau_descuenta_vacaciones,
          tau_es_protegida: tipo.tau_es_protegida,
          tau_es_intradia: tipo.tau_es_intradia,
          tau_referencia_legal: tipo.tau_referencia_legal ?? '',
        }
      : {
          tau_codigo: '',
          tau_nombre: '',
          tau_requiere_documento_ccss: false,
          tau_paga_empleador_dias: 0,
          tau_porcentaje_pago_empleador: 0,
          tau_paga_ccss_desde_dia: undefined,
          tau_porcentaje_subsidio_ccss: undefined,
          tau_descuenta_vacaciones: false,
          tau_es_protegida: false,
          tau_es_intradia: false,
          tau_referencia_legal: '',
        },
  })

  async function onSubmit(input: TipoAusenciaInput) {
    setServerError(null)

    const result = isEditing
      ? await updateTipoAusencia(tipo!.tau_id, input)
      : await createTipoAusencia(input)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/settings', 'layout') en el server action ya refresca la ruta.
    onSuccess?.()
  }

  const numberField = (
    name:
      | 'tau_paga_empleador_dias'
      | 'tau_porcentaje_pago_empleador'
      | 'tau_paga_ccss_desde_dia'
      | 'tau_porcentaje_subsidio_ccss',
    label: string,
    props: { min: number; max: number; placeholder?: string; help?: string }
  ) => (
    <div>
      <label className={LABEL} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        step={1}
        disabled={isSubmitting}
        aria-invalid={!!errors[name]}
        {...register(name, { valueAsNumber: true })}
        className={`${INPUT} tabular-nums`}
        placeholder={props.placeholder}
      />
      {props.help && <p className="mt-1 text-[11px] text-slate-500">{props.help}</p>}
      {errors[name] && <p className={FIELD_ERROR}>{errors[name]?.message as string}</p>}
    </div>
  )

  const checkbox = (
    name:
      | 'tau_requiere_documento_ccss'
      | 'tau_descuenta_vacaciones'
      | 'tau_es_protegida'
      | 'tau_es_intradia',
    title: string,
    help: string
  ) => (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" disabled={isSubmitting} {...register(name)} className={CHECKBOX} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-[11px] text-slate-500">{help}</span>
      </span>
    </label>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <Alert>
          <div>{serverError}</div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="tau_nombre">
            Nombre
          </label>
          <input
            id="tau_nombre"
            disabled={isSubmitting}
            aria-invalid={!!errors.tau_nombre}
            {...register('tau_nombre')}
            className={INPUT}
            placeholder="Incapacidad por enfermedad"
          />
          {errors.tau_nombre && <p className={FIELD_ERROR}>{errors.tau_nombre.message}</p>}
        </div>

        <div>
          <label className={LABEL} htmlFor="tau_codigo">
            Código
          </label>
          <input
            id="tau_codigo"
            disabled={isSubmitting || isEditing}
            aria-invalid={!!errors.tau_codigo}
            {...register('tau_codigo')}
            className={`${INPUT} font-mono uppercase`}
            placeholder="INC_ENF"
            maxLength={20}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {isEditing ? 'No se puede cambiar.' : 'Identificador único. No se podrá cambiar.'}
          </p>
          {errors.tau_codigo && <p className={FIELD_ERROR}>{errors.tau_codigo.message}</p>}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className={LABEL}>Pago del patrono</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numberField('tau_paga_empleador_dias', 'Días que paga', {
            min: 0,
            max: 365,
            help: 'Tope mensual de días pagados por el patrono.',
          })}
          {numberField('tau_porcentaje_pago_empleador', '% del salario', { min: 0, max: 100 })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={LABEL}>Subsidio de la CCSS / INS (opcional)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {numberField('tau_paga_ccss_desde_dia', 'Paga desde el día', {
            min: 1,
            max: 365,
            placeholder: 'Sin subsidio',
          })}
          {numberField('tau_porcentaje_subsidio_ccss', '% del subsidio', {
            min: 0,
            max: 100,
            placeholder: 'Sin subsidio',
          })}
        </div>
      </fieldset>

      <div className="space-y-3">
        {checkbox(
          'tau_requiere_documento_ccss',
          'Requiere boleta de la CCSS',
          'Pide el número de boleta al registrar la ausencia.'
        )}
        {checkbox(
          'tau_descuenta_vacaciones',
          'Descuenta de vacaciones',
          'Cada día de esta ausencia se resta del saldo de vacaciones.'
        )}
        {checkbox(
          'tau_es_protegida',
          'Ausencia protegida por ley',
          'Marca fuero o licencia legal (maternidad, paternidad, riesgo de trabajo…).'
        )}
        {checkbox(
          'tau_es_intradia',
          'Se mide en horas dentro del día',
          'Para permisos como lactancia: no cuenta como día completo de ausencia.'
        )}
      </div>

      <div>
        <label className={LABEL} htmlFor="tau_referencia_legal">
          Referencia legal
        </label>
        <input
          id="tau_referencia_legal"
          disabled={isSubmitting}
          aria-invalid={!!errors.tau_referencia_legal}
          {...register('tau_referencia_legal')}
          className={INPUT}
          placeholder="Código de Trabajo, art. 95"
        />
        {errors.tau_referencia_legal && (
          <p className={FIELD_ERROR}>{errors.tau_referencia_legal.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" block>
        {isSubmitting ? (
          <>
            <Loader2 className={SPINNER} /> Guardando
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" /> {isEditing ? 'Actualizar tipo' : 'Crear tipo'}
          </>
        )}
      </Button>
    </form>
  )
}
