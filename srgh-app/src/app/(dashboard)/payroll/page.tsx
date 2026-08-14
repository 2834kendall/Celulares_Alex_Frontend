import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ACCESO_NOMINA } from '@/lib/permissions/zones'
import { ModulePlaceholder } from '@/components/ui/ModulePlaceholder'
import { getPeriodos } from '@/modules/payroll/actions/getPeriodos'
import { PayrollHeader } from '@/modules/payroll/components/PayrollHeader'
import { PeriodosList } from '@/modules/payroll/components/PeriodosList'
import { Alert } from '@/components/ui/Alert'

export default async function PayrollPage() {
  const claims = await requireAnyPermission(ACCESO_NOMINA)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canRead = permisos.includes(PERMISOS.NOMINA_READ)
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)
  const canManageConceptos = permisos.includes(PERMISOS.CATALOGOS_WRITE)

  // Empleados con solo COMPROBANTES_READ: su vista de comprobantes propios
  // llega en la siguiente iteración del módulo.
  if (!canRead) {
    return (
      <ModulePlaceholder
        title="Nomina"
        description="Aquí podrás consultar tus comprobantes de pago. Disponible próximamente."
      />
    )
  }

  const periodosResult = await getPeriodos()

  if (!periodosResult.ok) {
    return <Alert size="md">{periodosResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PayrollHeader canWrite={canWrite} canManageConceptos={canManageConceptos} />
      <PeriodosList periodos={periodosResult.data} />
    </div>
  )
}
