import type { AuthError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { SgrhJwtClaims } from '@/types/auth'

export type UpdatePasswordResult = { ok: true; destination: string } | { ok: false; error: string }

/**
 * Mapea el error de updateUser al mensaje que ve la persona. Compartido por
 * la activacion y la recuperacion: el fallo es el mismo, solo cambia como se
 * llego hasta aqui.
 */
export function getPasswordUpdateMessage(error: AuthError) {
  const message = error.message.toLowerCase()

  if (error.code === 'same_password' || message.includes('different from the old')) {
    return 'La nueva contraseña debe ser distinta a la anterior.'
  }

  if (error.code === 'weak_password' || message.includes('weak')) {
    return 'La contraseña es demasiado débil. Use una combinación más segura.'
  }

  return 'No se pudo guardar la contraseña. Intente de nuevo.'
}

/**
 * Define la contraseña sobre la sesion que ya establecio /auth/confirm al
 * verificar el token del correo (invitacion o recuperacion). updateUser corre
 * SOLO en el servidor, igual que el login.
 *
 * `expiredMessage` es lo unico que distingue a los dos flujos: sin sesion no
 * hay a quien ponerle contraseña, pero la salida que se le ofrece a la persona
 * cambia (pedir que le reenvien la invitacion vs. solicitar otro enlace).
 */
export async function updatePasswordWithSession(
  password: string,
  expiredMessage: string
): Promise<UpdatePasswordResult> {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    return { ok: false, error: expiredMessage }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { ok: false, error: getPasswordUpdateMessage(error) }
  }

  // Mismo criterio que el login: sin permisos en el JWT no hay dashboard.
  const meta = (claimsData.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  return { ok: true, destination: permisos.length > 0 ? '/dashboard' : '/unauthorized' }
}
