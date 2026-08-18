'use client'

import { useFormContext } from 'react-hook-form'
import type { CatalogoItem } from '@/modules/employees/types'
import { getFieldError, INPUT_CLASSES, Labeled } from './EmployeeFields'
import { Alert } from '@/components/ui/Alert'
import { ControlledSelectMenu, parseNumber, parseOptionalNumber } from '@/components/ui/SelectMenu'

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
    control,
    formState: { errors },
  } = useFormContext()

  return (
    <div className="space-y-4">
      {!canInviteUser && (
        <Alert tone="info" size="md">
          <p>
            Tu rol no tiene permiso de gestión de usuarios. Puedes crear el empleado sin cuenta; un
            administrador podrá invitarlo más adelante.
          </p>
        </Alert>
      )}

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={crearUsuario}
          disabled={!canInviteUser}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
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
            <ControlledSelectMenu
              control={control}
              name="usuario.rol_id"
              parse={parseNumber}
              invalid={Boolean(getFieldError(errors, 'usuario.rol_id'))}
              options={roles.map((rol) => ({ value: String(rol.id), label: rol.nombre }))}
            />
          </Labeled>

          <Labeled label="Sucursal (opcional)" error={getFieldError(errors, 'usuario.sucursal_id')}>
            <ControlledSelectMenu
              control={control}
              name="usuario.sucursal_id"
              parse={parseOptionalNumber}
              invalid={Boolean(getFieldError(errors, 'usuario.sucursal_id'))}
              options={[
                { value: '', label: 'Todas las sucursales' },
                ...sucursales.map((sucursal) => ({
                  value: String(sucursal.id),
                  label: sucursal.nombre,
                })),
              ]}
            />
          </Labeled>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          El empleado se creará sin acceso al sistema. La cuenta puede crearse después desde la
          pestaña Usuarios del módulo de empleados.
        </p>
      )}
    </div>
  )
}
