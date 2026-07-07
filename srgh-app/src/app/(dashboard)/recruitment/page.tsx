import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_RECLUTAMIENTO } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function RecruitmentPage() {
  await requireAnyPermission(ACCESO_RECLUTAMIENTO)

  return (
    <ModulePlaceholder
      title="Reclutamiento"
      description="Candidatos, postulaciones y pipeline de seleccion."
    />
  )
}
