import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getProvisionesAguinaldo } from '@/modules/payroll/actions/getProvisionesAguinaldo'
import { getMotivosSalida } from '@/modules/payroll/actions/getMotivosSalida'
import { getEmpleadosActivosParaLiquidacion } from '@/modules/payroll/actions/getEmpleadosActivosParaLiquidacion'
import { AguinaldoLiquidacionView } from '@/modules/payroll/components/AguinaldoLiquidacionView'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

export default async function AguinaldoLiquidacionPage() {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const [aguinaldosResult, motivosResult, empleadosResult] = await Promise.all([
    getProvisionesAguinaldo(),
    getMotivosSalida(),
    canWrite
      ? getEmpleadosActivosParaLiquidacion()
      : Promise.resolve({ ok: true as const, data: [] }),
  ])

  if (!aguinaldosResult.ok) {
    return <ErrorBanner message={aguinaldosResult.error} />
  }
  if (!motivosResult.ok) {
    return <ErrorBanner message={motivosResult.error} />
  }
  if (!empleadosResult.ok) {
    return <ErrorBanner message={empleadosResult.error} />
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/payroll"
          aria-label="Volver a nómina"
          className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900">Aguinaldo y liquidación</h1>
          <p className="text-xs text-slate-500">
            Aguinaldo acumulado del ciclo actual y cálculo de liquidaciones por salida de empleado.
          </p>
        </div>
      </div>

      <AguinaldoLiquidacionView
        anio={aguinaldosResult.data.anio}
        aguinaldos={aguinaldosResult.data.items}
        canWrite={canWrite}
        empleadosActivos={empleadosResult.data}
        motivos={motivosResult.data}
      />
    </div>
  )
}
