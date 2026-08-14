import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmployees } from '@/modules/employees/actions/getEmployees'
import { getRoles, getSucursales } from '@/modules/employees/actions/getCatalogs'
import { EmployeesHeader } from '@/modules/employees/components/EmployeesHeader'
import { EmployeesList } from '@/modules/employees/components/EmployeesList'
import { EmployeeTabs } from '@/modules/employees/components/EmployeeTabs'
import { getEmployeesWithoutUser } from '@/modules/users/actions/getEmployeesWithoutUser'
import { getUsers } from '@/modules/users/actions/getUsers'
import { UsersList } from '@/modules/users/components/UsersList'
import { Alert } from '@/components/ui/Alert'

/** Carga del tab Usuarios (solo con USUARIOS_WRITE): lista + apoyos del form. */
async function loadUsersTab() {
  const [usersResult, sinUsuarioResult, rolesResult, sucursalesResult] = await Promise.all([
    getUsers(),
    getEmployeesWithoutUser(),
    getRoles(),
    getSucursales(),
  ])

  const firstError = [usersResult, sinUsuarioResult, rolesResult, sucursalesResult].find(
    (result) => !result.ok
  )
  if (firstError && !firstError.ok) {
    return <Alert size="md">{firstError.error}</Alert>
  }
  if (!usersResult.ok || !sinUsuarioResult.ok || !rolesResult.ok || !sucursalesResult.ok) {
    return null
  }

  return (
    <UsersList
      usuarios={usersResult.data}
      roles={rolesResult.data}
      sucursales={sucursalesResult.data}
      empleadosSinUsuario={sinUsuarioResult.data}
    />
  )
}

export default async function EmployeesPage() {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.EMPLEADOS_WRITE)
  const canManageUsers = permisos.includes(PERMISOS.USUARIOS_WRITE)
  const canAccessRecruitment =
    permisos.includes(PERMISOS.RECLUTAMIENTO_READ) ||
    permisos.includes(PERMISOS.RECLUTAMIENTO_WRITE)

  const [employeesResult, usuariosContent] = await Promise.all([
    getEmployees(),
    canManageUsers ? loadUsersTab() : Promise.resolve(null),
  ])

  if (!employeesResult.ok) {
    return <Alert size="md">{employeesResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <EmployeesHeader canWrite={canWrite} canAccessRecruitment={canAccessRecruitment} />
      <EmployeeTabs
        empleadosContent={<EmployeesList employees={employeesResult.data} canWrite={canWrite} />}
        usuariosContent={usuariosContent}
      />
    </div>
  )
}
