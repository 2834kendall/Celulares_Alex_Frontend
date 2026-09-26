import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_RECLUTAMIENTO } from '@/lib/permissions/zones'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getPostulacionesBoard } from '@/modules/recruitment/actions/getPostulacionesBoard'
import {
  getPuestos,
  getSucursales,
  getTiposIdentificacion,
} from '@/modules/employees/actions/getCatalogs'
import { RecruitmentBoard } from '@/modules/recruitment/components/RecruitmentBoard'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

// Los criterios de puntaje NO se administran desde acá: viven en
// Configuración → Criterios de selección, junto a Puestos y Tardías, que es
// donde están los demás catálogos de la empresa.
export default async function RecruitmentPage() {
  const claims = await requireAnyPermission(ACCESO_RECLUTAMIENTO)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)

  const [boardResult, tiposIdentificacionResult, puestosResult, sucursalesResult] =
    await Promise.all([
      getPostulacionesBoard(),
      getTiposIdentificacion(),
      getPuestos(),
      getSucursales(),
    ])

  if (!boardResult.ok) {
    return <Alert size="md">{boardResult.error}</Alert>
  }
  if (!tiposIdentificacionResult.ok || !puestosResult.ok || !sucursalesResult.ok) {
    return <Alert size="md">No se pudieron cargar los catálogos.</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Reclutamiento"
        description="Candidatos, postulaciones y embudo de selección."
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
