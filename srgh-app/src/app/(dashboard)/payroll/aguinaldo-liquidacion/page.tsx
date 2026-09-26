import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getProvisionesAguinaldo } from '@/modules/payroll/actions/getProvisionesAguinaldo'
import { getMotivosSalida } from '@/modules/payroll/actions/getMotivosSalida'
import { getEmpleadosActivosParaLiquidacion } from '@/modules/payroll/actions/getEmpleadosActivosParaLiquidacion'
import { getLiquidaciones } from '@/modules/payroll/actions/getLiquidaciones'
import { AguinaldoLiquidacionView } from '@/modules/payroll/components/AguinaldoLiquidacionView'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'
import { hoyLocal } from '@/modules/payroll/lib/fechas'
import { aperturaPagoAguinaldo } from '@/modules/payroll/lib/aguinaldoData'

interface AguinaldoLiquidacionPageProps {
  searchParams: Promise<{ anio?: string }>
}

export default async function AguinaldoLiquidacionPage({
  searchParams,
}: AguinaldoLiquidacionPageProps) {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  // Ciclo en curso por defecto; se deja ver también el anterior, por si
  // quedó algún aguinaldo sin pagar (la liquidación avisa cuando pasa).
  const hoy = hoyLocal()
  const anioActual = Number(hoy.slice(0, 4))
  const { anio: anioParam } = await searchParams
  const anio = Number(anioParam) === anioActual - 1 ? anioActual - 1 : anioActual

  const [aguinaldosResult, motivosResult, empleadosResult, liquidacionesResult] = await Promise.all(
    [
      getProvisionesAguinaldo(anio),
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
        description="Aguinaldo del ciclo y liquidaciones por salida de empleado, cada pago con su comprobante."
      />

      <AguinaldoLiquidacionView
        anio={aguinaldosResult.data.anio}
        anioActual={anioActual}
        cicloCerrado={hoy >= aperturaPagoAguinaldo(aguinaldosResult.data.anio)}
        puedeLeerAusencias={aguinaldosResult.data.puedeLeerAusencias}
        aguinaldos={aguinaldosResult.data.items}
        canWrite={canWrite}
        empleadosActivos={empleadosResult.data}
        motivos={motivosResult.data}
        liquidaciones={liquidacionesResult.data}
      />
    </div>
  )
}
