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
import { formatDate } from '@/modules/employees/lib/format'
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
        /** La fecha de inicio no se edita (ISO): se muestra como texto. */
        fechaInicio: string
        /** Nombre de la sucursal actual, para cuando no se puede cambiar. */
        sucursalNombre: string
        /**
         * Motivo por el que la sucursal NO se puede cambiar, o null si sí.
         * Hoy el único motivo es una quincena sin pagar: moverla ahí dejaría
         * la fila en la planilla de la sucursal vieja y la nueva la volvería
         * a crear.
         */
        sucursalBloqueada: string | null
        onSubmit: (values: EditarContratoInput) => void | Promise<void>
      }
  )

/**
 * Formulario puro de un contrato: NO llama ninguna Server Action, el padre
 * decide qué hacer con los valores validados (mismo contrato que
 * DocumentMetadataForm).
 *
 * En modo "editar" la fecha de inicio no es un campo —se muestra como texto—
 * porque moverla dejaría las marcas, los turnos y el contrato anterior
 * apuntando a un período que ya no existe. La sucursal sí se edita (es la
 * sucursal BASE, no dónde trabaja la persona cada día), salvo cuando llega
 * `sucursalBloqueada`.
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={LABEL_CLASSES}>Inicio del contrato</span>
              <p className="text-sm text-slate-700">{formatDate(props.fechaInicio)}</p>
            </div>
            {props.sucursalBloqueada !== null && (
              <div>
                <span className={LABEL_CLASSES}>Sucursal</span>
                <p className="text-sm text-slate-700">{props.sucursalNombre}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{props.sucursalBloqueada}</p>
              </div>
            )}
          </div>
        )}

        <ContractFields
          {...catalogos}
          mostrarSucursal={props.modo === 'crear' || props.sucursalBloqueada === null}
          mostrarFechaInicio={props.modo === 'crear'}
        />

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
