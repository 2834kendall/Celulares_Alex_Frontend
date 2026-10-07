'use client'

import { FormProvider, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import {
  crearHistorialLaboralSchema,
  editarContratoSchema,
  type CrearHistorialLaboralInput,
  type EditarContratoInput,
} from '@/modules/employees/types'
import { Button } from '@/components/ui/Button'
import { SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { ContractFields, type ContractCatalogs } from './ContractFields'
import { LABEL_CLASSES } from './EmployeeFields'

interface ContractFormBaseProps {
  catalogos: ContractCatalogs
  defaultValues?: Partial<CrearHistorialLaboralInput>
  serverError?: string | null
  submitLabel?: string
  onCancel: () => void
}

type ContractFormProps = ContractFormBaseProps &
  (
    | { modo: 'crear'; onSubmit: (values: CrearHistorialLaboralInput) => void | Promise<void> }
    | {
        modo: 'editar'
        /** La sucursal no se edita: se muestra como texto. */
        sucursalNombre: string
        onSubmit: (values: EditarContratoInput) => void | Promise<void>
      }
  )

/**
 * Formulario puro de un contrato: NO llama ninguna Server Action, el padre
 * decide qué hacer con los valores validados (mismo contrato que
 * DocumentMetadataForm). En modo "editar" no existe el campo de sucursal:
 * cambiarla en sitio sería un traslado encubierto.
 *
 * Sin "Enter para enviar" a propósito: acá Enter también elige una opción en
 * los selects y en el calendario, y mandaría el formulario a medio llenar.
 */
export function ContractForm(props: ContractFormProps) {
  const { catalogos, defaultValues, serverError, submitLabel = 'Guardar', onCancel } = props

  const methods = useForm<CrearHistorialLaboralInput>({
    // El formulario trabaja con el tipo de alta (superconjunto); en "editar"
    // el schema simplemente no pide ni devuelve lab_sucursal_id.
    resolver: (props.modo === 'crear'
      ? zodResolver(crearHistorialLaboralSchema)
      : zodResolver(editarContratoSchema)) as unknown as Resolver<CrearHistorialLaboralInput>,
    mode: 'onTouched',
    defaultValues: {
      lab_puesto_id: defaultValues?.lab_puesto_id,
      lab_sucursal_id: defaultValues?.lab_sucursal_id,
      lab_tipo_contrato_id: defaultValues?.lab_tipo_contrato_id,
      lab_tipo_jornada_id: defaultValues?.lab_tipo_jornada_id,
      // Un contrato nuevo arranca hoy por defecto (hora de Costa Rica); al
      // editar siempre llega la fecha guardada.
      lab_fecha_inicio: defaultValues?.lab_fecha_inicio ?? todayInCostaRica(),
      lab_salario_base: defaultValues?.lab_salario_base,
      lab_salario_real: defaultValues?.lab_salario_real,
    },
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  // En modo "editar" el schema ya descartó lab_sucursal_id.
  const submit = handleSubmit(async (values) => {
    await props.onSubmit(values)
  })

  return (
    <FormProvider {...methods}>
      <div className="space-y-3">
        {serverError && (
          <Alert>
            <div>{serverError}</div>
          </Alert>
        )}

        {props.modo === 'editar' && (
          <div>
            <span className={LABEL_CLASSES}>Sucursal</span>
            <p className="text-sm text-slate-700">{props.sucursalNombre}</p>
          </div>
        )}

        <ContractFields {...catalogos} mostrarSucursal={props.modo === 'crear'} />

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button onClick={onCancel} disabled={isSubmitting} variant="secondary" size="md">
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={isSubmitting} size="md">
            {isSubmitting && <Loader2 className={SPINNER} />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </FormProvider>
  )
}
