import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getBancoHoras } from '@/modules/payroll/actions/getBancoHoras'
import { BancoHorasView } from '@/modules/payroll/components/BancoHorasView'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function BancoHorasPage() {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const permisos = (claims.app_metadata as { permisos?: string[] })?.permisos ?? []
  const canWrite = permisos.includes(PERMISOS.NOMINA_WRITE)

  const result = await getBancoHoras()
  if (!result.ok) {
    return <Alert size="md">{result.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver a nómina"
        title="Banco de horas"
        description="Horas extra pendientes de las quincenas ya guardadas: se pagan en el periodo actual en borrador o se compensan como registro."
      />

      <BancoHorasView
        pendientes={result.data.pendientes}
        historial={result.data.historial}
        canWrite={canWrite}
      />
    </div>
  )
}
