import { createClient } from '@/lib/supabase/server'
import { expiredLinkContent } from '@/modules/auth/constants'
import { ExpiredLink } from '@/modules/auth/components/ExpiredLink'
import { ResetPasswordForm } from '@/modules/auth/components/ResetPasswordForm'

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  // Sin sesión no hay a quién cambiarle la contraseña: el token del correo
  // era inválido, ya se usó o venció (aquí redirige /auth/confirm en ese caso).
  if (!data?.claims) {
    return <ExpiredLink {...expiredLinkContent.recovery} />
  }

  return <ResetPasswordForm email={data.claims.email ?? ''} />
}
