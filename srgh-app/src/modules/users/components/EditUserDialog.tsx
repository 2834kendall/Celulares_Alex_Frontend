'use client'

import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AlertTriangle, Info, Loader2, Save } from 'lucide-react'
import type { CatalogoItem } from '@/modules/employees/types'
import {
  editarAsignacionSchema,
  type EditarAsignacionInput,
  type EmpleadoSinUsuario,
  type UsuarioListItem,
} from '@/modules/users/types'
import { updateUserAssignment } from '@/modules/users/actions/updateUserAssignment'
import { INPUT_CLASSES, Labeled, toOptionalNumber } from './fields'
import { UserModal } from './UserModal'

interface EditUserDialogProps {
  usuario: UsuarioListItem
  roles: CatalogoItem[]
  sucursales: CatalogoItem[]
  empleadosSinUsuario: EmpleadoSinUsuario[]
  onClose: () => void
}

/** Edición de rol/sucursal y del vínculo con el empleado. El email no se edita. */
export function EditUserDialog({
  usuario,
  roles,
  sucursales,
  empleadosSinUsuario,
  onClose,
}: EditUserDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  // El empleado ya vinculado no está en la lista "sin usuario"; se antepone
  // para que el select pueda mostrar (y conservar) el vínculo actual.
  const opcionesEmpleado =
    usuario.empleado_id && usuario.empleado_nombre
      ? [
          {
            emp_id: usuario.empleado_id,
            nombre_completo: usuario.empleado_nombre,
            email_personal: null,
            puesto_nombre: null,
          },
          ...empleadosSinUsuario,
        ]
      : empleadosSinUsuario

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarAsignacionInput>({
    // z.preprocess vuelve `unknown` el lado input del schema; el formulario
    // trabaja con el tipo de salida (''→null ya resuelto por el resolver).
    resolver: zodResolver(editarAsignacionSchema) as Resolver<EditarAsignacionInput>,
    defaultValues: {
      rol_id: usuario.rol_id,
      sucursal_id: usuario.sucursal_id,
      empleado_id: usuario.empleado_id,
    },
  })

  async function onSubmit(input: EditarAsignacionInput) {
    setServerError(null)

    const result = await updateUserAssignment(usuario.usr_id, input)
    if (!result.ok) {
      setServerError(result.error)
      return
    }

    toast.success('Usuario actualizado.')
    onClose()
  }

  return (
    <UserModal title="Editar usuario" subtitle={usuario.email} onClose={onClose}>
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

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>
            Los permisos se calculan al iniciar sesión: los cambios de rol y sucursal aplican en el
            próximo inicio de sesión del usuario.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Rol *" error={errors.rol_id?.message}>
            <select
              {...register('rol_id', { valueAsNumber: true })}
              aria-invalid={Boolean(errors.rol_id)}
              className={INPUT_CLASSES}
            >
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Sucursal (opcional)" error={errors.sucursal_id?.message}>
            <select
              {...register('sucursal_id', { setValueAs: toOptionalNumber })}
              aria-invalid={Boolean(errors.sucursal_id)}
              className={INPUT_CLASSES}
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </select>
          </Labeled>
        </div>

        <Labeled label="Empleado vinculado (opcional)" error={errors.empleado_id?.message}>
          <select
            {...register('empleado_id', { setValueAs: toOptionalNumber })}
            aria-invalid={Boolean(errors.empleado_id)}
            className={INPUT_CLASSES}
          >
            <option value="">Sin empleado vinculado</option>
            {opcionesEmpleado.map((empleado) => (
              <option key={empleado.emp_id} value={empleado.emp_id}>
                {empleado.nombre_completo}
              </option>
            ))}
          </select>
        </Labeled>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
    </UserModal>
  )
}
