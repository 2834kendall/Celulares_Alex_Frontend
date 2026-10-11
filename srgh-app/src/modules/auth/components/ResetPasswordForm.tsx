'use client'

import { resetPassword } from '@/modules/auth/actions/resetPassword'
import { SetPasswordForm } from '@/modules/auth/components/SetPasswordForm'

interface ResetPasswordFormProps {
  /** Email de la cuenta que se está recuperando (sale de la sesión). */
  email: string
}

/**
 * Cierre de la recuperación: la sesión la estableció /auth/confirm con el
 * token del correo, aquí la persona elige la contraseña nueva.
 */
export function ResetPasswordForm({ email }: ResetPasswordFormProps) {
  return (
    <SetPasswordForm
      action={resetPassword}
      title="Restablecer contraseña"
      description={
        <>
          Elija la contraseña nueva
          {email ? (
            <>
              {' '}
              de <span className="font-semibold text-slate-700">{email}</span>
            </>
          ) : null}
          .
        </>
      }
      submitLabel="Guardar contraseña"
      pendingLabel="Guardando contraseña"
      footer="¿No solicitó este cambio? Avise al soporte interno de TI."
    />
  )
}
