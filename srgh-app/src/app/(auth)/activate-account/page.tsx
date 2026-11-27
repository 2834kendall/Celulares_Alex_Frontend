import { getActiveSessionClaims } from '@/lib/auth/session-active'
import { expiredLinkContent } from '@/modules/auth/constants'
import { ActivateAccountForm } from '@/modules/auth/components/ActivateAccountForm'
import { ExpiredLink } from '@/modules/auth/components/ExpiredLink'

export default async function ActivateAccountPage() {
  const claims = await getActiveSessionClaims()

  // Sin sesión vigente no hay a quién ponerle contraseña: el token era
  // inválido, venció o la cuenta fue desactivada antes de activarla.
  if (!claims) {
    return <ExpiredLink {...expiredLinkContent.invite} />
  }

  return <ActivateAccountForm email={claims.email ?? ''} />
}
