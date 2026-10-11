import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getCandidateDetail } from '@/modules/recruitment/actions/getCandidateDetail'
import { getEtapasSeleccion } from '@/modules/recruitment/actions/getEtapasSeleccion'
import { getSelectionCriteria } from '@/modules/recruitment/actions/getSelectionCriteria'
import { getPuestos, getSucursales } from '@/modules/employees/actions/getCatalogs'
import { CandidateDetail } from '@/modules/recruitment/components/CandidateDetail'
import { PageError } from '@/components/ui/PageError'

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

  // Sin datos no hay nombre que mostrar: el error lleva un titulo generico y
  // la flecha de volver, para no dejar la pantalla sin salida.
  const errorView = (message: string) => (
    <PageError title="Ficha del candidato" backHref="/recruitment" backLabel="Volver al tablero">
      {message}
    </PageError>
  )

  if (!detailResult.ok) {
    if (detailResult.notFound) notFound()
    return errorView(detailResult.error)
  }
  if (!etapasResult.ok) {
    return errorView(etapasResult.error)
  }
  if (!criteriosResult.ok) {
    return errorView(criteriosResult.error)
  }
  if (!puestosResult.ok || !sucursalesResult.ok) {
    return errorView('No se pudieron cargar los catálogos.')
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
