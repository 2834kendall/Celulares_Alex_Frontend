import { getActiveSessionClaims } from '@/lib/auth/session-active'
import { AccessDenied } from '@/modules/auth/components/AccessDenied'
import { accessExit } from '@/modules/auth/lib/accessExit'

export default async function UnauthorizedPage() {
  // Solo para elegir la salida (ver accessExit): si la sesión fue revocada,
  // ofrece "Iniciar sesión" en lugar de "Cerrar sesión".
  const claims = await getActiveSessionClaims()

  return <AccessDenied exit={accessExit(claims)} />
}
