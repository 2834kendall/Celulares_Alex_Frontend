import { AlertTriangle } from 'lucide-react'
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

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

export default async function EvaluationsPage() {
  const claims = await requireAnyPermission(ACCESO_EVALUACIONES)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.EVALUACIONES_WRITE)
  const canWriteRubros = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  const [overviewResult, rubrosResult] = await Promise.all([getEvaluationsOverview(), getRubros()])

  if (!overviewResult.ok) {
    return <ErrorBanner message={overviewResult.error} />
  }

  if (!rubrosResult.ok) {
    return <ErrorBanner message={rubrosResult.error} />
  }

  const { collaborators, branches } = overviewResult
  const rubros = rubrosResult.data

  return (
    <div className="min-w-0 space-y-4">
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
