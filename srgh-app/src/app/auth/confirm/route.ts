import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Intercambia el token del email (invitación, recuperación, etc.) por una
 * sesión en cookies. La plantilla de email de Supabase debe apuntar aquí:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 * verifyOtp corre en el servidor (patrón @supabase/ssr); el enlace clásico
 * {{ .ConfirmationURL }} devuelve la sesión en el fragmento de la URL, que
 * el servidor nunca ve, y por eso no sirve con sesión en cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') ?? '/activate-account'
  // Solo rutas internas: un `next` absoluto sería un open redirect.
  const next =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/activate-account'

  const redirectTo = request.nextUrl.clone()
  redirectTo.searchParams.delete('token_hash')
  redirectTo.searchParams.delete('type')
  redirectTo.searchParams.delete('next')

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

    if (!error) {
      redirectTo.pathname = next
      return NextResponse.redirect(redirectTo)
    }
  }

  // Token inválido o expirado: se redirige al MISMO destino que en el caso
  // feliz. Esas pantallas, al no recibir sesión, muestran el estado de enlace
  // vencido con la salida que corresponde a su flujo (reenviar la invitación
  // vs. pedir otro enlace de recuperación). Mandar todo a /activate-account
  // dejaba a quien recuperaba su contraseña leyendo sobre invitaciones.
  redirectTo.pathname = next
  return NextResponse.redirect(redirectTo)
}
