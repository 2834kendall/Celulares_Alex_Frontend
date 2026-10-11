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
import { PageError } from '@/components/ui/PageError'
import { PageHeader } from '@/components/ui/PageHeader'

// Las COLUMNAS del tablero (las etapas del proceso) se administran acá mismo,
// con CATALOGOS_WRITE. Los criterios de puntaje no: viven en Configuración →
// Criterios de selección, junto a los demás catálogos de la empresa.
export default async function RecruitmentPage() {
  const claims = await requireAnyPermission(ACCESO_RECLUTAMIENTO)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)
  const canManageStages = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  const [boardResult, tiposIdentificacionResult, puestosResult, sucursalesResult] =
    await Promise.all([
      getPostulacionesBoard(),
      getTiposIdentificacion(),
      getPuestos(),
      getSucursales(),
    ])

  if (!boardResult.ok) {
    return <PageError title="Reclutamiento">{boardResult.error}</PageError>
  }
  if (!tiposIdentificacionResult.ok || !puestosResult.ok || !sucursalesResult.ok) {
    return <PageError title="Reclutamiento">No se pudieron cargar los catálogos.</PageError>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Reclutamiento" />

      <RecruitmentBoard
        postulaciones={boardResult.data}
        stages={boardResult.stages}
        tiposIdentificacion={tiposIdentificacionResult.data}
        puestos={puestosResult.data}
        sucursales={sucursalesResult.data}
        canWrite={canWrite}
        canManageStages={canManageStages}
      />
    </div>
  )
}
