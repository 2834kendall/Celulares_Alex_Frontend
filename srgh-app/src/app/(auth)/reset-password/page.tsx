import { getActiveSessionClaims } from '@/lib/auth/session-active'
import { expiredLinkContent } from '@/modules/auth/constants'
import { ExpiredLink } from '@/modules/auth/components/ExpiredLink'
import { ResetPasswordForm } from '@/modules/auth/components/ResetPasswordForm'

export default async function ResetPasswordPage() {
  const claims = await getActiveSessionClaims()

  // Sin sesión vigente no hay a quién cambiarle la contraseña: el token era
  // inválido, ya se usó, venció o la cuenta fue desactivada.
  if (!claims) {
    return <ExpiredLink {...expiredLinkContent.recovery} />
  }

  return <ResetPasswordForm email={claims.email ?? ''} />
}
