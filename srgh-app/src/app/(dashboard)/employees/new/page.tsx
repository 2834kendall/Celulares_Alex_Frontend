import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  getBancos,
  getPuestos,
  getRoles,
  getSucursales,
  getTiposContrato,
  getTiposIdentificacion,
  getTiposJornada,
} from '@/modules/employees/actions/getCatalogs'
import { EmployeeWizard } from '@/modules/employees/components/EmployeeWizard'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

export default async function NewEmployeePage() {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_WRITE)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canInviteUser = permisos.includes(PERMISOS.USUARIOS_WRITE)

  const [
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
    rolesResult,
  ] = await Promise.all([
    getTiposIdentificacion(),
    getPuestos(),
    getSucursales(),
    getTiposContrato(),
    getTiposJornada(),
    getBancos(),
    canInviteUser ? getRoles() : Promise.resolve(null),
  ])

  const results = [
    tiposIdentificacionResult,
    puestosResult,
    sucursalesResult,
    tiposContratoResult,
    tiposJornadaResult,
    bancosResult,
  ]
  const failed = results.find((result) => !result.ok)
  if (failed && !failed.ok) {
    return <ErrorBanner message={failed.error} />
  }

  if (rolesResult && !rolesResult.ok) {
    return <ErrorBanner message={rolesResult.error} />
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/employees"
          aria-label="Volver al listado"
          className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900">Nuevo empleado</h1>
          <p className="text-xs text-slate-500">
            Alta en tres pasos: información principal, datos de nómina y cuenta de usuario.
          </p>
        </div>
      </div>

      <EmployeeWizard
        tiposIdentificacion={tiposIdentificacionResult.ok ? tiposIdentificacionResult.data : []}
        puestos={puestosResult.ok ? puestosResult.data : []}
        sucursales={sucursalesResult.ok ? sucursalesResult.data : []}
        tiposContrato={tiposContratoResult.ok ? tiposContratoResult.data : []}
        tiposJornada={tiposJornadaResult.ok ? tiposJornadaResult.data : []}
        bancos={bancosResult.ok ? bancosResult.data : []}
        roles={rolesResult?.ok ? rolesResult.data : []}
        canInviteUser={canInviteUser}
      />
    </div>
  )
}
