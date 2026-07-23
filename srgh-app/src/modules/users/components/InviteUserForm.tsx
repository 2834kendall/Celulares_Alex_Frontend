'use client'

import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Send } from 'lucide-react'
import type { CatalogoItem } from '@/modules/employees/types'
import { invitarUsuarioSchema, type InvitarUsuarioInput } from '@/modules/users/types'
import type { EmpleadoSinUsuario } from '@/modules/users/types'
import { inviteUser } from '@/modules/users/actions/inviteUser'
import { INPUT_CLASSES, Labeled, toOptionalNumber } from './fields'
import { UserModal } from './UserModal'

interface InviteUserFormProps {
  roles: CatalogoItem[]
  sucursales: CatalogoItem[]
  empleadosSinUsuario: EmpleadoSinUsuario[]
  /** Precarga desde el bloque "empleados sin usuario". */
  prefill?: EmpleadoSinUsuario
  onClose: () => void
}

/**
 * Invitación de un usuario nuevo: email real de Supabase Auth; el empleado
 * vinculado es opcional (solo se ofrecen los que aún no tienen cuenta).
 */
export function InviteUserForm({
  roles,
  sucursales,
  empleadosSinUsuario,
  prefill,
  onClose,
}: InviteUserFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvitarUsuarioInput>({
    // z.preprocess vuelve `unknown` el lado input del schema; el formulario
    // trabaja con el tipo de salida (''→null ya resuelto por el resolver).
    resolver: zodResolver(invitarUsuarioSchema) as Resolver<InvitarUsuarioInput>,
    defaultValues: {
      email: prefill?.email_personal ?? '',
      sucursal_id: null,
      empleado_id: prefill?.emp_id ?? null,
    },
  })

  async function onSubmit(input: InvitarUsuarioInput) {
    setServerError(null)

    const result = await inviteUser(input)
    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // revalidatePath('/employees') en la action ya refresca la lista.
    toast.success(`Invitación enviada a ${input.email}.`)
    onClose()
  }

  return (
    <UserModal
      title="Invitar usuario"
      subtitle="Recibirá un email para definir su contraseña en el primer acceso."
      onClose={onClose}
    >
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

        <Labeled label="Empleado vinculado (opcional)" error={errors.empleado_id?.message}>
          <select
            {...register('empleado_id', {
              setValueAs: toOptionalNumber,
              onChange: (e) => {
                // Sugiere el email personal del empleado si aún no se escribió uno.
                const empleado = empleadosSinUsuario.find(
                  (emp) => emp.emp_id === Number(e.target.value)
                )
                if (empleado?.email_personal && !getValues('email')) {
                  setValue('email', empleado.email_personal)
                }
              },
            })}
            aria-invalid={Boolean(errors.empleado_id)}
            className={INPUT_CLASSES}
          >
            <option value="">Sin empleado vinculado</option>
            {empleadosSinUsuario.map((empleado) => (
              <option key={empleado.emp_id} value={empleado.emp_id}>
                {empleado.nombre_completo}
              </option>
            ))}
          </select>
        </Labeled>

        <Labeled label="Email de acceso *" error={errors.email?.message}>
          <input
            type="email"
            {...register('email')}
            aria-invalid={Boolean(errors.email)}
            className={INPUT_CLASSES}
            placeholder="colaborador@empresa.com"
          />
        </Labeled>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Rol *" error={errors.rol_id?.message}>
            <select
              {...register('rol_id', { valueAsNumber: true })}
              aria-invalid={Boolean(errors.rol_id)}
              className={INPUT_CLASSES}
            >
              <option value="">Seleccionar…</option>
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
              <Send className="h-3.5 w-3.5" />
            )}
            Enviar invitación
          </button>
        </div>
      </form>
    </UserModal>
  )
}
