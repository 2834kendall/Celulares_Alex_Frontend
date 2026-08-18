import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getProvisionesAguinaldo } from '@/modules/payroll/actions/getProvisionesAguinaldo'
import { getMotivosSalida } from '@/modules/payroll/actions/getMotivosSalida'
import { getEmpleadosActivosParaLiquidacion } from '@/modules/payroll/actions/getEmpleadosActivosParaLiquidacion'
import { getLiquidaciones } from '@/modules/payroll/actions/getLiquidaciones'
import { AguinaldoLiquidacionView } from '@/modules/payroll/components/AguinaldoLiquidacionView'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function AguinaldoLiquidacionPage() {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const [aguinaldosResult, motivosResult, empleadosResult, liquidacionesResult] = await Promise.all(
    [
      getProvisionesAguinaldo(),
      getMotivosSalida(),
      canWrite
        ? getEmpleadosActivosParaLiquidacion()
        : Promise.resolve({ ok: true as const, data: [] }),
      getLiquidaciones(),
    ]
  )

  if (!aguinaldosResult.ok) {
    return <Alert size="md">{aguinaldosResult.error}</Alert>
  }
  if (!motivosResult.ok) {
    return <Alert size="md">{motivosResult.error}</Alert>
  }
  if (!empleadosResult.ok) {
    return <Alert size="md">{empleadosResult.error}</Alert>
  }
  if (!liquidacionesResult.ok) {
    return <Alert size="md">{liquidacionesResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver a nómina"
        title="Aguinaldo y liquidación"
        description="Aguinaldo acumulado del ciclo actual y cálculo de liquidaciones por salida de empleado."
      />

      <AguinaldoLiquidacionView
        anio={aguinaldosResult.data.anio}
        aguinaldos={aguinaldosResult.data.items}
        canWrite={canWrite}
        empleadosActivos={empleadosResult.data}
        motivos={motivosResult.data}
        liquidaciones={liquidacionesResult.data}
      />
    </div>
  )
}
