import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalesNomina } from '@/modules/payroll/actions/getCatalogs'
import { PeriodoForm } from '@/modules/payroll/components/PeriodoForm'
import { PageError } from '@/components/ui/PageError'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewPeriodoPage() {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const sucursalesResult = await getSucursalesNomina()

  if (!sucursalesResult.ok) {
    return (
      <PageError title="Nuevo periodo de nómina" backHref="/payroll" backLabel="Volver al listado">
        {sucursalesResult.error}
      </PageError>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver al listado"
        title="Nuevo periodo de nómina"
        description="Se crea en borrador; la planilla se calcula después."
      />

      <div className="mx-auto w-full max-w-2xl">
        <PeriodoForm sucursales={sucursalesResult.data} />
      </div>
    </div>
  )
}
