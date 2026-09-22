import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_RECLUTAMIENTO } from '@/lib/permissions/zones'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getPostulacionesBoard } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { getRubrosSeleccion } from '@/modules/recruitment/actions/getRubrosSeleccion'
import {
  getPuestos,
  getSucursales,
  getTiposIdentificacion,
} from '@/modules/employees/actions/getCatalogs'
import { RecruitmentBoard } from '@/modules/recruitment/components/RecruitmentBoard'
import { CriteriaAdminButton } from '@/modules/recruitment/components/CriteriaAdminButton'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function RecruitmentPage() {
  const claims = await requireAnyPermission(ACCESO_RECLUTAMIENTO)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)
  const canManageCriteria = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  const [boardResult, tiposIdentificacionResult, puestosResult, sucursalesResult, rubrosResult] =
    await Promise.all([
      getPostulacionesBoard(),
      getTiposIdentificacion(),
      getPuestos(),
      getSucursales(),
      canManageCriteria ? getRubrosSeleccion() : Promise.resolve(null),
    ])

  if (!boardResult.ok) {
    return <Alert size="md">{boardResult.error}</Alert>
  }
  if (!tiposIdentificacionResult.ok || !puestosResult.ok || !sucursalesResult.ok) {
    return <Alert size="md">No se pudieron cargar los catálogos.</Alert>
  }
  if (rubrosResult && !rubrosResult.ok) {
    return <Alert size="md">{rubrosResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Reclutamiento"
        description="Candidatos, postulaciones y embudo de selección."
        actions={
          canManageCriteria && rubrosResult ? (
            <CriteriaAdminButton rubros={rubrosResult.data} />
          ) : undefined
        }
      />

      <RecruitmentBoard
        postulaciones={boardResult.data}
        tiposIdentificacion={tiposIdentificacionResult.data}
        puestos={puestosResult.data}
        sucursales={sucursalesResult.data}
        canWrite={canWrite}
      />
    </div>
  )
}
