import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getProvisionesAguinaldo } from '@/modules/payroll/actions/getProvisionesAguinaldo'
import { getContratosPorLiquidar } from '@/modules/payroll/actions/getContratosPorLiquidar'
import { getLiquidaciones } from '@/modules/payroll/actions/getLiquidaciones'
import { AguinaldoLiquidacionView } from '@/modules/payroll/components/AguinaldoLiquidacionView'
import { PageError } from '@/components/ui/PageError'
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

  const [aguinaldosResult, contratosResult, liquidacionesResult, anteriorResult] =
    await Promise.all([
      getProvisionesAguinaldo(anio),
      // Contratos que RRHH ya terminó desde el perfil del empleado y falta
      // liquidar (SGRH-90). La fecha y el motivo vienen con cada uno.
      canWrite ? getContratosPorLiquidar() : Promise.resolve({ ok: true as const, data: [] }),
      getLiquidaciones(),
      // Mirando el año en curso, ¿quedó algún aguinaldo del anterior sin pagar?
      // En enero la pestaña abre el nuevo y esos se perdían de vista.
      anio === anioActual ? getProvisionesAguinaldo(anioActual - 1) : Promise.resolve(null),
    ])

  const errorView = (message: string) => (
    <PageError title="Aguinaldo y liquidación" backHref="/payroll" backLabel="Volver a nómina">
      {message}
    </PageError>
  )

  if (!aguinaldosResult.ok) {
    return errorView(aguinaldosResult.error)
  }
  if (!contratosResult.ok) {
    return errorView(contratosResult.error)
  }
  if (!liquidacionesResult.ok) {
    return errorView(liquidacionesResult.error)
  }

  // Es un aviso, no el contenido de la pantalla: si esa lectura falla, la
  // pantalla se muestra igual, sin el aviso.
  const pendientes = anteriorResult?.ok
    ? anteriorResult.data.items.filter((a) => !a.pagado && a.elegible && a.monto > 0)
    : []
  const pendientesAnterior =
    pendientes.length > 0
      ? {
          anio: anioActual - 1,
          cantidad: pendientes.length,
          monto: Math.round(pendientes.reduce((s, a) => s + a.monto, 0) * 100) / 100,
        }
      : null

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver a nómina"
        title="Aguinaldo y liquidación"
        description="Aguinaldo de cada año y liquidaciones por salida, con su comprobante."
      />

      <AguinaldoLiquidacionView
        anio={aguinaldosResult.data.anio}
        anioActual={anioActual}
        cicloCerrado={hoy >= aperturaPagoAguinaldo(aguinaldosResult.data.anio)}
        puedeLeerAusencias={aguinaldosResult.data.puedeLeerAusencias}
        aguinaldos={aguinaldosResult.data.items}
        canWrite={canWrite}
        contratosPorLiquidar={contratosResult.data}
        liquidaciones={liquidacionesResult.data}
        pendientesAnterior={pendientesAnterior}
      />
    </div>
  )
}
