import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getBancoHoras } from '@/modules/payroll/actions/getBancoHoras'
import { BancoHorasView } from '@/modules/payroll/components/BancoHorasView'
import { PageError } from '@/components/ui/PageError'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function BancoHorasPage() {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const result = await getBancoHoras()
  if (!result.ok) {
    return (
      <PageError title="Banco de horas" backHref="/payroll" backLabel="Volver a nómina">
        {result.error}
      </PageError>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver a nómina"
        title="Banco de horas"
        description="Horas extra pendientes: se pagan en un periodo en borrador o se compensan."
      />

      <BancoHorasView
        pendientes={result.data.pendientes}
        historial={result.data.historial}
        canWrite={canWrite}
      />
    </div>
  )
}
