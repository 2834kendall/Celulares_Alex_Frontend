'use server'

import type { AuthError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { activateAccountSchema, type ActivateAccountInput } from '@/modules/auth/types'
import type { SgrhJwtClaims } from '@/types/auth'

export type ActivateAccountResult = { ok: true; destination: string } | { ok: false; error: string }

function getActivationMessage(error: AuthError) {
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
 * Define la contraseña del primer acceso. La sesión la estableció el route
 * handler /auth/confirm al verificar el token de la invitación; como en el
 * login, updateUser corre SOLO en el servidor.
 */
export async function activateAccount(input: ActivateAccountInput): Promise<ActivateAccountResult> {
  const parsed = activateAccountSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de activación inválidos.' }
  }

  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    return {
      ok: false,
      error: 'El enlace de activación expiró. Solicite que le reenvíen la invitación.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { ok: false, error: getActivationMessage(error) }
  }

  // Mismo criterio que el login: sin permisos en el JWT no hay dashboard.
  const meta = (claimsData.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  return { ok: true, destination: permisos.length > 0 ? '/dashboard' : '/unauthorized' }
}
