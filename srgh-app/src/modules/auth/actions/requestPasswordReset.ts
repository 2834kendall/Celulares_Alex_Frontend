'use server'

import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/modules/auth/types'

export type RequestPasswordResetResult = { ok: true } | { ok: false; error: string }

/**
 * Primer paso de la recuperación: dispara el correo con el enlace.
 *
 * Dos diferencias deliberadas con el patrón de Server Action del resto del
 * sistema, porque esta acción es la ÚNICA que corre para alguien sin sesión:
 *
 * 1. NO lleva requirePermission. Quien olvidó su contraseña no tiene JWT que
 *    consultar — pedirle un permiso sería pedirle que inicie sesión para poder
 *    recuperar el acceso. No es un descuido: no lo "arregles" agregándolo.
 * 2. NO usa createAdminClient. Esto es self-service y el endpoint de
 *    recuperación es anónimo por diseño; la secret key no tiene nada que hacer
 *    en un formulario público.
 *
 * Y por eso mismo la respuesta NUNCA revela si el correo existe: el formulario
 * está abierto a internet y confirmar cuentas lo convertiría en un directorio
 * de los correos de la empresa. Un correo desconocido y uno real devuelven
 * exactamente el mismo { ok: true }.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput
): Promise<RequestPasswordResetResult> {
  const parsed = forgotPasswordSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Ingrese un correo electrónico válido.' }
  }

  const supabase = await createClient()

  // Sin `redirectTo` a propósito: la URL del enlace la arma la plantilla con
  // {{ .SiteURL }}, igual que la de invitación. Pasarlo poblaría
  // {{ .RedirectTo }}, que la plantilla no usa.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email)

  if (error) {
    const message = error.message.toLowerCase()

    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return {
        ok: false,
        error: 'Demasiadas solicitudes. Espere unos minutos antes de volver a intentar.',
      }
    }

    // La caída de red sí se reporta: no es información sobre la cuenta, y
    // callarla dejaría a la persona esperando un correo que nunca salió.
    if (message.includes('failed to fetch') || message.includes('network')) {
      return {
        ok: false,
        error:
          'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.',
      }
    }

    // Cualquier otro fallo de la API (correo inexistente incluido) se responde
    // como éxito: ver el comentario de arriba.
    return { ok: true }
  }

  return { ok: true }
}
