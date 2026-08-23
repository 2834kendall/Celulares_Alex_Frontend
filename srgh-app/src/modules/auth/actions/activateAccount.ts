'use server'

import { activateAccountSchema, type ActivateAccountInput } from '@/modules/auth/types'
import {
  updatePasswordWithSession,
  type UpdatePasswordResult,
} from '@/modules/auth/lib/updatePassword'

export type ActivateAccountResult = UpdatePasswordResult

/**
 * Define la contraseña del primer acceso. La sesión la estableció el route
 * handler /auth/confirm al verificar el token de la invitación; como en el
 * login, updateUser corre SOLO en el servidor.
 */
export async function activateAccount(input: ActivateAccountInput): Promise<ActivateAccountResult> {
  const parsed = activateAccountSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de activación inválidos.' }
  }

  return updatePasswordWithSession(
    parsed.data.password,
    'El enlace de activación expiró. Solicite que le reenvíen la invitación.'
  )
}
