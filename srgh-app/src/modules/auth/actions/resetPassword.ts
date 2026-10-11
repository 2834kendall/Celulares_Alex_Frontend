'use server'

import { resetPasswordSchema, type ResetPasswordInput } from '@/modules/auth/types'
import {
  updatePasswordWithSession,
  type UpdatePasswordResult,
} from '@/modules/auth/lib/updatePassword'

export type ResetPasswordResult = UpdatePasswordResult

/**
 * Segundo paso de la recuperación: define la contraseña nueva. La sesión la
 * estableció /auth/confirm al verificar el token de tipo `recovery`, así que
 * llegar hasta aquí YA prueba que la persona controla el correo de la cuenta.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de recuperación inválidos.' }
  }

  return updatePasswordWithSession(
    parsed.data.password,
    'El enlace de recuperación expiró. Solicite uno nuevo desde la pantalla de acceso.'
  )
}
