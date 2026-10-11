import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ACCESO_EVALUACIONES } from '@/lib/permissions/zones'
import { getEvaluationsOverview } from '@/modules/evaluations/actions/getEvaluationsOverview'
import { getRubros } from '@/modules/evaluations/actions/getRubros'
import { BranchMetrics } from '@/modules/evaluations/components/BranchMetrics'
import { EvaluationTabs } from '@/modules/evaluations/components/EvaluationTabs'
import { IndividualView } from '@/modules/evaluations/components/IndividualView'
import { NewEvaluationSection } from '@/modules/evaluations/components/NewEvaluationSection'
import { RubrosManager } from '@/modules/evaluations/components/RubrosManager'
import { PageError } from '@/components/ui/PageError'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function EvaluationsPage() {
  const claims = await requireAnyPermission(ACCESO_EVALUACIONES)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.EVALUACIONES_WRITE)
  const canWriteRubros = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  const [overviewResult, rubrosResult] = await Promise.all([getEvaluationsOverview(), getRubros()])

  if (!overviewResult.ok) {
    return <PageError title="Evaluaciones">{overviewResult.error}</PageError>
  }

  if (!rubrosResult.ok) {
    return <PageError title="Evaluaciones">{rubrosResult.error}</PageError>
  }

  const { collaborators, branches } = overviewResult
  const rubros = rubrosResult.data

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Evaluaciones" />
      <EvaluationTabs
        canWrite={canWrite}
        metricasContent={
          <BranchMetrics collaborators={collaborators} branches={branches} rubros={rubros} />
        }
        individualContent={
          <IndividualView collaborators={collaborators} rubros={rubros} canWrite={canWrite} />
        }
        rubrosContent={<RubrosManager rubros={rubros} canWrite={canWriteRubros} />}
        nuevaContent={<NewEvaluationSection collaborators={collaborators} rubros={rubros} />}
      />
    </div>
  )
}
