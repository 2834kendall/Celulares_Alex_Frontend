import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_EVALUACIONES } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'

export default async function EvaluationsPage() {
  await requireAnyPermission(ACCESO_EVALUACIONES)

  return (
    <ModulePlaceholder
      title="Evaluaciones"
      description="Evaluaciones de desempeno por criterios y comisiones."
    />
  )
}
