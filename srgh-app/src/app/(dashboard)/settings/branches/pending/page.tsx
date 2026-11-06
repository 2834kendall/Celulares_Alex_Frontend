import { branchAdmin } from '@/modules/settings/branches/access'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { LocalPendingReview } from '@/modules/settings/branches/LocalPendingReview'
export default async function PendingKioskPage() {
  const { empresa } = await branchAdmin()
  await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  return <LocalPendingReview empresaId={empresa} />
}
