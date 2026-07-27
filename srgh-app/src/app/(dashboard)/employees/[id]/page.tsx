import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmployeeDetail } from '@/modules/employees/actions/getEmployeeDetail'
import {
  getBancos,
  getTerritorio,
  getTiposIdentificacion,
} from '@/modules/employees/actions/getCatalogs'
import { EmployeeDetail } from '@/modules/employees/components/EmployeeDetail'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

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

  const [detailResult, tiposIdentificacionResult, bancosResult, territorioResult] =
    await Promise.all([
      getEmployeeDetail(empId),
      getTiposIdentificacion(),
      getBancos(),
      getTerritorio(),
    ])

  if (!detailResult.ok) {
    if (detailResult.notFound) {
      notFound()
    }
    return <ErrorBanner message={detailResult.error} />
  }

  if (!tiposIdentificacionResult.ok) {
    return <ErrorBanner message={tiposIdentificacionResult.error} />
  }

  if (!bancosResult.ok) {
    return <ErrorBanner message={bancosResult.error} />
  }

  if (!territorioResult.ok) {
    return <ErrorBanner message={territorioResult.error} />
  }

  return (
    <EmployeeDetail
      empleado={detailResult.data}
      tiposIdentificacion={tiposIdentificacionResult.data}
      bancos={bancosResult.data}
      territorio={territorioResult.data}
      canWrite={canWrite}
    />
  )
}
