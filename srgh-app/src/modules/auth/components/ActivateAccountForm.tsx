'use client'

import { activateAccount } from '@/modules/auth/actions/activateAccount'
import { SetPasswordForm } from '@/modules/auth/components/SetPasswordForm'

interface ActivateAccountFormProps {
  /** Email de la cuenta invitada (sale de la sesión, solo informativo). */
  email: string
}

/**
 * Primer acceso tras la invitación: la sesión ya existe (la estableció
 * /auth/confirm), aquí la persona define su contraseña y entra al sistema.
 */
export function ActivateAccountForm({ email }: ActivateAccountFormProps) {
  return (
    <SetPasswordForm
      action={activateAccount}
      title="Activá tu cuenta"
      description={
        <>
          Definí la contraseña con la que vas a ingresar
          {email ? (
            <>
              {' '}
              como <span className="font-semibold text-slate-700">{email}</span>
            </>
          ) : null}
          .
        </>
      }
      submitLabel="Activar cuenta"
      pendingLabel="Guardando contraseña"
      footer="¿Dificultades con la activación? Contactá al soporte interno de TI."
    />
  )
}
