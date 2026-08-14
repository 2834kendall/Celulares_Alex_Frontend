import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  getBancos,
  getPuestos,
  getRoles,
  getSucursales,
  getTerritorio,
  getTiposContrato,
  getTiposDocumento,
  getTiposIdentificacion,
  getTiposJornada,
} from '@/modules/employees/actions/getCatalogs'
import { EmployeeWizard } from '@/modules/employees/components/EmployeeWizard'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewEmployeePage() {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canInviteUser = permisos.includes(PERMISOS.USUARIOS_WRITE)
  const canManageDocs = permisos.includes(PERMISOS.DOCUMENTOS_WRITE)

  const [
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
    territorioResult,
    rolesResult,
    tiposDocumentoResult,
  ] = await Promise.all([
    getTiposIdentificacion(),
    getPuestos(),
    getSucursales(),
    getTiposContrato(),
    getTiposJornada(),
    getBancos(),
    getTerritorio(),
    canInviteUser ? getRoles() : Promise.resolve(null),
    // getTiposDocumento exige DOCUMENTOS_READ (via requirePermission): sin el
    // permiso, llamarla redirigiría la página entera a /unauthorized.
    canManageDocs ? getTiposDocumento() : Promise.resolve(null),
  ])

  const results = [
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
    territorioResult,
  ]
  const failed = results.find((result) => !result.ok)
  if (failed && !failed.ok) {
    return <Alert size="md">{failed.error}</Alert>
  }

  if (rolesResult && !rolesResult.ok) {
    return <Alert size="md">{rolesResult.error}</Alert>
  }

  if (tiposDocumentoResult && !tiposDocumentoResult.ok) {
    return <Alert size="md">{tiposDocumentoResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/employees"
        backLabel="Volver al listado"
        title="Nuevo empleado"
        description="Alta en cuatro pasos: información principal, datos de nómina, documentos y cuenta de usuario."
      />

      <EmployeeWizard
        tiposIdentificacion={tiposIdentificacionResult.ok ? tiposIdentificacionResult.data : []}
        puestos={puestosResult.ok ? puestosResult.data : []}
        sucursales={sucursalesResult.ok ? sucursalesResult.data : []}
        tiposContrato={tiposContratoResult.ok ? tiposContratoResult.data : []}
        tiposJornada={tiposJornadaResult.ok ? tiposJornadaResult.data : []}
        bancos={bancosResult.ok ? bancosResult.data : []}
        territorio={
          territorioResult.ok
            ? territorioResult.data
            : { provincias: [], cantones: [], distritos: [] }
        }
        tiposDocumento={tiposDocumentoResult?.ok ? tiposDocumentoResult.data : []}
        canManageDocs={canManageDocs}
        roles={rolesResult?.ok ? rolesResult.data : []}
        canInviteUser={canInviteUser}
      />
    </div>
  )
}
