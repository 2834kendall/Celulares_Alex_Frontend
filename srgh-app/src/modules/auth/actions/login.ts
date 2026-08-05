'use server'

import type { AuthError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, type LoginInput } from '@/modules/auth/types'
import type { SgrhJwtClaims } from '@/types/auth'

export type LoginResult = { ok: true; destination: string } | { ok: false; error: string }

function getLoginMessage(error: AuthError) {
  const message = error.message.toLowerCase()

  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Demasiados intentos. Espere un momento antes de volver a intentar.'
  }

  if (error.code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'No se pudo completar el acceso. Confirme su correo o contacte al administrador.'
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.'
  }

  return 'Credenciales invalidas.'
}

/**
 * Login como Server Action: signInWithPassword corre SOLO en el servidor,
 * el token nunca pasa por el JavaScript del navegador durante la autenticacion.
 * Valida el payload con el MISMO esquema Zod del cliente (validacion doble).
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de acceso invalidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { ok: false, error: getLoginMessage(error) }
  }

  // Los permisos y el rol viven en el JWT (los inyecta el hook de Supabase)
  const { data } = await supabase.auth.getClaims()
  const meta = (data?.claims?.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  // La cuenta KIOSCO es un dispositivo compartido, no una persona: jamas debe
  // aterrizar en el dashboard administrativo (aunque sus permisos alcancen
  // para ver algo ahi) — va directo a la pantalla de marcado.
  if (meta.rol === 'KIOSCO') {
    return { ok: true, destination: '/kiosco' }
  }

  return { ok: true, destination: permisos.length > 0 ? '/dashboard' : '/unauthorized' }
}
