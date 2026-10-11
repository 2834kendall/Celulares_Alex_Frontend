'use client'

import { useState } from 'react'
import { FormProvider, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  editarFichaEmpleadoSchema,
  type CatalogoItem,
  type EditarFichaEmpleadoInput,
  type EmpleadoDetalle,
  type TerritorioCatalogo,
} from '@/modules/employees/types'
import { updateEmployee } from '@/modules/employees/actions/updateEmployee'
import { AddressFields, BankingFields, PersonalDataFields } from './EmployeeFields'
import { Button } from '@/components/ui/Button'
import { SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type FichaGenero = EditarFichaEmpleadoInput['empleado']['emp_genero']
type PagoTipoCuenta = NonNullable<EditarFichaEmpleadoInput['datos_pago']>['edp_tipo_cuenta']

interface EmployeeFormProps {
  empleado: EmpleadoDetalle
  tiposIdentificacion: CatalogoItem[]
  bancos: CatalogoItem[]
  territorio: TerritorioCatalogo
  onSuccess?: () => void
  onCancel?: () => void
}

/** Edición de la ficha personal + dirección + datos de pago (el contrato no se toca aquí). */
export function EmployeeForm({
  empleado,
  tiposIdentificacion,
  bancos,
  territorio,
  onSuccess,
  onCancel,
}: EmployeeFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  // Guardado en espera de que el usuario confirme una cuenta repetida.
  const [duplicado, setDuplicado] = useState<{
    mensaje: string
    values: EditarFichaEmpleadoInput
  } | null>(null)
  // El reintento tras confirmar no pasa por handleSubmit, así que isSubmitting
  // no lo cubre y el botón quedaría habilitado durante el guardado.
  const [reintentando, setReintentando] = useState(false)

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
      // AddressFields deriva provincia y cantón desde este distrito al montar.
      direccion: {
        dir_distrito_id: empleado.direccion?.dir_distrito_id ?? undefined,
        dir_senas_exactas: empleado.direccion?.dir_senas_exactas ?? '',
      },
      datos_pago: {
        edp_banco_id: empleado.datos_pago?.edp_banco_id ?? undefined,
        edp_tipo_cuenta: (empleado.datos_pago?.edp_tipo_cuenta ?? undefined) as PagoTipoCuenta,
        edp_numero_cuenta: empleado.datos_pago?.edp_numero_cuenta ?? '',
      },
    },
  })

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = methods

  async function guardar(values: EditarFichaEmpleadoInput, confirmado = false) {
    setServerError(null)

    const result = await updateEmployee(empleado.emp_id, {
      ...values,
      confirmar_cuenta_duplicada: confirmado,
    })

    if (!result.ok) {
      // La cuenta ya existe en otro empleado. No es un error: puede ser
      // legítimo (una cuenta compartida), así que se pregunta en vez de
      // bloquear, y el reenvío lleva el flag de confirmación.
      if (result.requiereConfirmacion) {
        setDuplicado({ mensaje: result.error, values })
        return
      }
      setServerError(result.error)
      return
    }

    // Guardó, pero conservó una cuenta que no se pudo descifrar en vez de
    // borrarla. Va como warning y no como success: el usuario tiene que saber
    // que ese campo quedó sin actualizar.
    if (result.warning) toast.warning(result.warning)
    else toast.success('Cambios guardados correctamente.')

    onSuccess?.()
  }

  async function onSubmit(values: EditarFichaEmpleadoInput) {
    await guardar(values)
  }

  async function confirmarDuplicado() {
    if (!duplicado) return
    const { values } = duplicado
    setDuplicado(null)
    setReintentando(true)
    try {
      await guardar(values, true)
    } finally {
      setReintentando(false)
    }
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="@container space-y-4">
        {serverError && (
          <Alert>
            <div>{serverError}</div>
          </Alert>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Datos personales y contacto
          </h3>
          <PersonalDataFields basePath="empleado." tiposIdentificacion={tiposIdentificacion} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Dirección</h3>
          <AddressFields basePath="direccion." territorio={territorio} />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Datos de pago
          </h3>
          {/* El campo queda editable a propósito: escribir un número nuevo es
              justamente cómo se repara la fila. Lo que no puede pasar es que el
              usuario crea que está vacía porque no hay cuenta — dejarla en
              blanco NO la borra, el servidor conserva la anterior. */}
          {empleado.datos_pago?.cuenta_ilegible && (
            <Alert tone="warning">
              No se pudo descifrar la cuenta guardada. Escribí el número de nuevo para reemplazarla;
              si lo dejás vacío, se conserva la anterior.
            </Alert>
          )}
          <BankingFields basePath="datos_pago." bancos={bancos} />
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
          )}
          <Button type="submit" disabled={isSubmitting || reintentando}>
            {(isSubmitting || reintentando) && <Loader2 className={SPINNER} />}
            Guardar cambios
          </Button>
        </div>
      </form>

      {duplicado && (
        <ConfirmDialog
          title="Cuenta bancaria repetida"
          message={duplicado.mensaje}
          confirmLabel="Guardar de todos modos"
          onCancel={() => setDuplicado(null)}
          onConfirm={confirmarDuplicado}
        />
      )}
    </FormProvider>
  )
}
