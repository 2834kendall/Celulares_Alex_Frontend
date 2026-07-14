'use client'

import { useState } from 'react'
import { FormProvider, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  editarFichaEmpleadoSchema,
  type CatalogoItem,
  type EditarFichaEmpleadoInput,
  type EmpleadoDetalle,
} from '@/modules/employees/types'
import { updateEmployee } from '@/modules/employees/actions/updateEmployee'
import { BankingFields, PersonalDataFields } from './EmployeeFields'

type FichaGenero = EditarFichaEmpleadoInput['empleado']['emp_genero']
type PagoTipoCuenta = NonNullable<EditarFichaEmpleadoInput['datos_pago']>['edp_tipo_cuenta']

interface EmployeeFormProps {
  empleado: EmpleadoDetalle
  tiposIdentificacion: CatalogoItem[]
  onSuccess?: () => void
  onCancel?: () => void
}

/** Edición de la ficha personal + datos de pago (el contrato no se toca aquí). */
export function EmployeeForm({
  empleado,
  tiposIdentificacion,
  onSuccess,
  onCancel,
}: EmployeeFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const methods = useForm<EditarFichaEmpleadoInput>({
    // z.preprocess vuelve `unknown` el lado input del schema; el formulario
    // trabaja con el tipo de salida (''→null ya resuelto por el resolver).
    resolver: zodResolver(editarFichaEmpleadoSchema) as Resolver<EditarFichaEmpleadoInput>,
    mode: 'onTouched',
    defaultValues: {
      empleado: {
        emp_nombre: empleado.emp_nombre,
        emp_apellido_1: empleado.emp_apellido_1,
        emp_apellido_2: empleado.emp_apellido_2 ?? '',
        emp_tipo_identificacion_id: empleado.emp_tipo_identificacion_id,
        emp_numero_identificacion: empleado.emp_numero_identificacion,
        emp_fecha_ingreso_original: empleado.emp_fecha_ingreso_original,
        emp_fecha_nacimiento: empleado.emp_fecha_nacimiento ?? '',
        emp_genero: (empleado.emp_genero ?? undefined) as FichaGenero,
        emp_nacionalidad: empleado.emp_nacionalidad,
        emp_telefono: empleado.emp_telefono ?? '',
        emp_email_personal: empleado.emp_email_personal ?? '',
        emp_numero_asegurado_ccss: empleado.emp_numero_asegurado_ccss ?? '',
        emp_nombre_contacto_emergencia: empleado.emp_nombre_contacto_emergencia ?? '',
        emp_telefono_emergencia: empleado.emp_telefono_emergencia ?? '',
      },
      datos_pago: {
        edp_banco: empleado.datos_pago?.edp_banco ?? '',
        edp_tipo_cuenta: (empleado.datos_pago?.edp_tipo_cuenta ?? undefined) as PagoTipoCuenta,
        edp_numero_cuenta: empleado.datos_pago?.edp_numero_cuenta ?? '',
      },
    },
  })

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  async function onSubmit(values: EditarFichaEmpleadoInput) {
    setServerError(null)

    const result = await updateEmployee(empleado.emp_id, values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success('Cambios guardados correctamente.')
    onSuccess?.()
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {serverError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
            <div>{serverError}</div>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Datos personales y contacto
          </h3>
          <PersonalDataFields basePath="empleado." tiposIdentificacion={tiposIdentificacion} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Datos de pago
          </h3>
          <BankingFields basePath="datos_pago." />
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </form>
    </FormProvider>
  )
}
