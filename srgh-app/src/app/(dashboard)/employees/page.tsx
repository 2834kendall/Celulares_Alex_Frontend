import { AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmployees } from '@/modules/employees/actions/getEmployees'
import { EmployeesHeader } from '@/modules/employees/components/EmployeesHeader'
import { EmployeesList } from '@/modules/employees/components/EmployeesList'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

export default async function EmployeesPage() {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.EMPLEADOS_WRITE)
  const canAccessRecruitment =
    permisos.includes(PERMISOS.RECLUTAMIENTO_READ) ||
    permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)

  // Promise.all queda listo para sumar loaders de las futuras sub-áreas
  // (usuarios, contratación) sin reestructurar la página.
  const [employeesResult] = await Promise.all([getEmployees()])

  if (!employeesResult.ok) {
    return <ErrorBanner message={employeesResult.error} />
  }

  return (
    <div className="min-w-0 space-y-4">
      <EmployeesHeader canWrite={canWrite} canAccessRecruitment={canAccessRecruitment} />
      <EmployeesList employees={employeesResult.data} canWrite={canWrite} />
    </div>
  )
}
