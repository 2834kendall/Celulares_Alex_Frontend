import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalesNomina } from '@/modules/payroll/actions/getCatalogs'
import { PeriodoForm } from '@/modules/payroll/components/PeriodoForm'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewPeriodoPage() {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const sucursalesResult = await getSucursalesNomina()

  if (!sucursalesResult.ok) {
    return <Alert size="md">{sucursalesResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver al listado"
        title="Nuevo periodo de nómina"
        description="El periodo nace en borrador; el cálculo de la planilla se ejecuta después."
      />

      <div className="mx-auto w-full max-w-2xl">
        <PeriodoForm sucursales={sucursalesResult.data} />
      </div>
    </div>
  )
}
