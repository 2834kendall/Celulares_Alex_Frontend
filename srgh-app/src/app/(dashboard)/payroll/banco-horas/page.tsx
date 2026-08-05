import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getBancoHoras } from '@/modules/payroll/actions/getBancoHoras'
import { BancoHorasView } from '@/modules/payroll/components/BancoHorasView'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

export default async function BancoHorasPage() {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const result = await getBancoHoras()
  if (!result.ok) {
    return <ErrorBanner message={result.error} />
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
          <h1 className="text-base font-bold text-slate-900">Banco de horas</h1>
          <p className="text-xs text-slate-500">
            Horas extra pendientes de las quincenas ya guardadas: se pagan en el periodo actual en
            borrador o se compensan como registro.
          </p>
        </div>
      </div>

      <BancoHorasView
        pendientes={result.data.pendientes}
        historial={result.data.historial}
        canWrite={canWrite}
      />
    </div>
  )
}
