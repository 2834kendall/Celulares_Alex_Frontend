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
      title="Activa tu cuenta"
      description={
        <>
          Define la contraseña con la que ingresarás
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
      footer="¿Dificultades con la activación? Contacte al soporte interno de TI."
    />
  )
}
