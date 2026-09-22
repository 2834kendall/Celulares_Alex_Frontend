import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getCandidateDetail } from '@/modules/recruitment/actions/getCandidateDetail'
import { getEtapasSeleccion } from '@/modules/recruitment/actions/getEtapasSeleccion'
import { getSelectionCriteria } from '@/modules/recruitment/actions/getSelectionCriteria'
import { getPuestos, getSucursales } from '@/modules/employees/actions/getCatalogs'
import { CandidateDetail } from '@/modules/recruitment/components/CandidateDetail'
import { Alert } from '@/components/ui/Alert'

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const { id } = await params
  const candidatoId = Number(id)

  if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
    notFound()
  }

  const claims = await requirePermission(PERMISOS.RECLUTAMIENTO_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)

  const [detailResult, etapasResult, criteriosResult, puestosResult, sucursalesResult] =
    await Promise.all([
      getCandidateDetail(candidatoId),
      getEtapasSeleccion(),
      getSelectionCriteria(),
      getPuestos(),
      getSucursales(),
    ])

  if (!detailResult.ok) {
    if (detailResult.notFound) notFound()
    return <Alert size="md">{detailResult.error}</Alert>
  }
  if (!etapasResult.ok) {
    return <Alert size="md">{etapasResult.error}</Alert>
  }
  if (!criteriosResult.ok) {
    return <Alert size="md">{criteriosResult.error}</Alert>
  }
  if (!puestosResult.ok || !sucursalesResult.ok) {
    return <Alert size="md">No se pudieron cargar los catálogos.</Alert>
  }

  return (
    <CandidateDetail
      candidato={detailResult.data}
      etapas={etapasResult.data}
      criterios={criteriosResult.data}
      puestos={puestosResult.data}
      sucursales={sucursalesResult.data}
      canWrite={canWrite}
    />
  )
}
