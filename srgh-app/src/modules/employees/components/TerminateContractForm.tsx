'use client'

import { useState } from 'react'
import { FormProvider, useForm, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import {
  terminarContratoSchema,
  type MotivoSalidaItem,
  type TerminarContratoInput,
} from '@/modules/employees/types'
import { formatDate } from '@/modules/employees/lib/format'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import {
  CatalogSelect,
  DateInput,
  getFieldError,
  INPUT_CLASSES,
  Labeled,
  LABEL_CLASSES,
} from './EmployeeFields'

interface TerminateContractFormProps {
  motivos: MotivoSalidaItem[]
  serverError?: string | null
  onCancel: () => void
  onSubmit: (values: TerminarContratoInput) => void | Promise<void>
}

/**
 * Mensaje de la confirmación. Con un último día de hoy o futuro (preaviso) la
 * RPC deja la terminación programada y la persona sigue activa hasta ese día;
 * con uno pasado, cierra en el acto. Esto solo elige el texto: quien decide
 * es la RPC, con la fecha de Costa Rica (la misma que usa esto por defecto).
 */
export function terminationConfirmMessage(
  fechaFin: string,
  hoy: string = todayInCostaRica()
): string {
  if (fechaFin >= hoy) {
    return `Seguirá activo hasta el ${formatDate(fechaFin)}: al día siguiente el contrato se cierra solo y queda pendiente de liquidar. Podés revertirlo mientras no se liquide.`
  }
  return 'El contrato quedará terminado y pendiente de liquidar. Podés revertirlo mientras no se liquide.'
}

/**
 * Terminar el contrato vigente (paso 1 de 2: el paso 2 es liquidarlo desde
 * Planilla). Pide confirmación antes de mandar: aunque se puede revertir,
 * terminar saca a la persona del kiosco y de la planilla.
 */
export function TerminateContractForm({
  motivos,
  serverError,
  onCancel,
  onSubmit,
}: TerminateContractFormProps) {
  const [porConfirmar, setPorConfirmar] = useState<TerminarContratoInput | null>(null)

  const methods = useForm<TerminarContratoInput>({
    // emptyToNull vuelve `unknown` el lado input del schema; el formulario
    // trabaja con el tipo de salida (mismo criterio que DocumentMetadataForm).
    resolver: zodResolver(terminarContratoSchema) as Resolver<TerminarContratoInput>,
    mode: 'onTouched',
    defaultValues: {
      // Hoy por defecto (hora de Costa Rica). Con hoy, la persona trabaja
      // hasta el final del día y el job cierra el contrato mañana.
      lab_fecha_fin: todayInCostaRica(),
      lab_motivo_salida_id: undefined,
      lab_recontratable: true,
      lab_observaciones_salida: '',
    },
  })
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = methods

  // useWatch y no watch(): el React Compiler no puede memoizar watch().
  const motivoElegidoId = useWatch({ control, name: 'lab_motivo_salida_id' })
  const motivoElegido = motivos.find((m) => m.id === motivoElegidoId)

  async function confirmar() {
    if (!porConfirmar || isSubmitting) return
    const valores = porConfirmar
    setPorConfirmar(null)
    // handleSubmit mantiene isSubmitting en true mientras corre el onSubmit.
    await handleSubmit(async () => {
      await onSubmit(valores)
    })()
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-3">
        {serverError && (
          <Alert>
            <div>{serverError}</div>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Último día de trabajo *" error={getFieldError(errors, 'lab_fecha_fin')}>
            <DateInput
              name="lab_fecha_fin"
              label="Último día de trabajo"
              invalid={Boolean(errors.lab_fecha_fin)}
            />
          </Labeled>

          <div>
            <CatalogSelect
              name="lab_motivo_salida_id"
              label="Motivo de salida *"
              options={motivos}
            />
            {motivoElegido && (
              <p className="mt-1 text-[11px] text-slate-400">
                {motivoElegido.generaCesantia ? 'Genera cesantía. ' : 'No genera cesantía. '}
                {motivoElegido.generaPreaviso ? 'Genera preaviso.' : 'No genera preaviso.'}
                {motivoElegido.notaLegal && ` ${motivoElegido.notaLegal}`}
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            {...register('lab_recontratable')}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
          />
          Recontratable
        </label>

        <div>
          <label className="block">
            <span className={LABEL_CLASSES}>Observaciones (opcional)</span>
            <textarea
              rows={2}
              {...register('lab_observaciones_salida')}
              aria-invalid={Boolean(errors.lab_observaciones_salida)}
              className={`${INPUT_CLASSES} resize-none`}
            />
          </label>
          {errors.lab_observaciones_salida && (
            <p role="alert" className="mt-1 text-[11px] font-medium text-rose-600">
              {errors.lab_observaciones_salida.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onCancel} disabled={isSubmitting} variant="secondary" size="md">
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit((values) => setPorConfirmar(values))()}
            disabled={isSubmitting}
            variant="danger"
            size="md"
          >
            {isSubmitting && <Loader2 className={SPINNER} />}
            Terminar contrato
          </Button>
        </div>
      </div>

      {porConfirmar && (
        <ConfirmDialog
          title="Terminar contrato"
          message={terminationConfirmMessage(porConfirmar.lab_fecha_fin)}
          confirmLabel="Terminar contrato"
          onCancel={() => setPorConfirmar(null)}
          onConfirm={() => void confirmar()}
        />
      )}
    </FormProvider>
  )
}
