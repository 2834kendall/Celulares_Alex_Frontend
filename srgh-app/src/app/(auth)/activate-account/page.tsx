import { createClient } from '@/lib/supabase/server'
import { expiredLinkContent } from '@/modules/auth/constants'
import { ActivateAccountForm } from '@/modules/auth/components/ActivateAccountForm'
import { ExpiredLink } from '@/modules/auth/components/ExpiredLink'

export default async function ActivateAccountPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  // Sin sesión no hay a quién ponerle contraseña: el token de la invitación
  // era inválido o ya venció (aquí redirige /auth/confirm en ese caso).
  if (!data?.claims) {
    return <ExpiredLink {...expiredLinkContent.invite} />
  }

  return <ActivateAccountForm email={data.claims.email ?? ''} />
}
