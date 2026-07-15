'use client'

import { useFormContext } from 'react-hook-form'
import { Info } from 'lucide-react'
import type { CatalogoItem } from '@/modules/employees/types'
import { getFieldError, INPUT_CLASSES, Labeled } from './EmployeeFields'

interface EmployeeWizardStepUsuarioProps {
  roles: CatalogoItem[]
  sucursales: CatalogoItem[]
  canInviteUser: boolean
  crearUsuario: boolean
  onToggle: (enabled: boolean) => void
}

/**
 * Paso 3 del onboarding (opcional): cuenta de acceso al sistema. El empleado
 * recibe un email de invitación y define su contraseña en el primer acceso.
 */
export function EmployeeWizardStepUsuario({
  roles,
  sucursales,
  canInviteUser,
  crearUsuario,
  onToggle,
}: EmployeeWizardStepUsuarioProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext()

  return (
    <div className="space-y-4">
      {!canInviteUser && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Tu rol no tiene permiso de gestión de usuarios. Puedes crear el empleado sin cuenta; un
            administrador podrá invitarlo más adelante.
          </p>
        </div>
      )}

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={crearUsuario}
          disabled={!canInviteUser}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="text-sm font-semibold text-slate-800">
          Crear cuenta de usuario del sistema
        </span>
      </label>

      {crearUsuario ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Labeled label="Email de acceso *" error={getFieldError(errors, 'usuario.email')}>
            <input
              type="email"
              {...register('usuario.email')}
              aria-invalid={Boolean(getFieldError(errors, 'usuario.email'))}
              className={INPUT_CLASSES}
              placeholder="colaborador@empresa.com"
            />
          </Labeled>

          <Labeled label="Rol *" error={getFieldError(errors, 'usuario.rol_id')}>
            <select
              {...register('usuario.rol_id', { valueAsNumber: true })}
              aria-invalid={Boolean(getFieldError(errors, 'usuario.rol_id'))}
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

          <Labeled label="Sucursal (opcional)" error={getFieldError(errors, 'usuario.sucursal_id')}>
            <select
              {...register('usuario.sucursal_id', {
                setValueAs: (value) => (value === '' ? null : Number(value)),
              })}
              aria-invalid={Boolean(getFieldError(errors, 'usuario.sucursal_id'))}
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
      ) : (
        <p className="text-xs text-slate-500">
          El empleado se creará sin acceso al sistema. La cuenta puede crearse después desde la
          futura sección de usuarios.
        </p>
      )}
    </div>
  )
}
