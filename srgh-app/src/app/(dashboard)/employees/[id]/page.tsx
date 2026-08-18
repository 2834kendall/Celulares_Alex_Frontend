import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmployeeDetail } from '@/modules/employees/actions/getEmployeeDetail'
import { getEmployeeDocuments } from '@/modules/employees/actions/getEmployeeDocuments'
import {
  getBancos,
  getTerritorio,
  getTiposDocumento,
  getTiposIdentificacion,
} from '@/modules/employees/actions/getCatalogs'
import { EmployeeDetail } from '@/modules/employees/components/EmployeeDetail'
import { Alert } from '@/components/ui/Alert'

interface EmployeeDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const { id } = await params
  const empId = Number(id)

  if (!Number.isInteger(empId) || empId <= 0) {
    notFound()
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.EMPLEADOS_WRITE)
  const canReadDocs = permisos.includes(PERMISOS.DOCUMENTOS_READ)
  const canWriteDocs = permisos.includes(PERMISOS.DOCUMENTOS_WRITE)

  const [
    detailResult,
    tiposIdentificacionResult,
    bancosResult,
    territorioResult,
    documentosResult,
    tiposDocumentoResult,
  ] = await Promise.all([
    getEmployeeDetail(empId),
    getTiposIdentificacion(),
    getBancos(),
    getTerritorio(),
    // Ambas exigen DOCUMENTOS_READ (via requirePermission): sin el permiso,
    // llamarlas redirigiría la página entera a /unauthorized.
    canReadDocs ? getEmployeeDocuments(empId) : Promise.resolve(null),
    canReadDocs ? getTiposDocumento() : Promise.resolve(null),
  ])

  if (!detailResult.ok) {
    if (detailResult.notFound) {
      notFound()
    }
    return <Alert size="md">{detailResult.error}</Alert>
  }

  if (!tiposIdentificacionResult.ok) {
    return <Alert size="md">{tiposIdentificacionResult.error}</Alert>
  }

  if (!bancosResult.ok) {
    return <Alert size="md">{bancosResult.error}</Alert>
  }

  if (!territorioResult.ok) {
    return <Alert size="md">{territorioResult.error}</Alert>
  }

  // A diferencia de los catálogos base, un fallo en documentos NO tumba la
  // página: se muestra la ficha igual y el error queda inline en su sección.
  const documentosError = documentosResult && !documentosResult.ok ? documentosResult.error : null
  const documentos = documentosResult?.ok ? documentosResult.data : canReadDocs ? [] : null
  const tiposDocumento = tiposDocumentoResult?.ok ? tiposDocumentoResult.data : []

  return (
    <EmployeeDetail
      empleado={detailResult.data}
      tiposIdentificacion={tiposIdentificacionResult.data}
      bancos={bancosResult.data}
      territorio={territorioResult.data}
      canWrite={canWrite}
      documentos={documentos}
      tiposDocumento={tiposDocumento}
      canWriteDocs={canWriteDocs}
      documentosError={documentosError}
    />
  )
}
