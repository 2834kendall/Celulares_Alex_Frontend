import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createClient } from '@/lib/supabase/server'
import { getSucursalesNomina } from '@/modules/payroll/actions/getCatalogs'
import { leerNominaPorEmpresa } from '@/modules/payroll/lib/alcancePlanilla'
import { PeriodoForm } from '@/modules/payroll/components/PeriodoForm'
import { PageError } from '@/components/ui/PageError'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewPeriodoPage() {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  // Con un periodo por empresa no se elige sucursal: no hace falta el catálogo.
  const porEmpresa = await leerNominaPorEmpresa(await createClient())
  if (porEmpresa === null) {
    return (
      <PageError title="Nuevo periodo de nómina" backHref="/payroll" backLabel="Volver al listado">
        No se pudo leer la configuración de nómina de la empresa.
      </PageError>
    )
  }

  const sucursalesResult = porEmpresa
    ? { ok: true as const, data: [] }
    : await getSucursalesNomina()

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
        <PeriodoForm sucursales={sucursalesResult.data} porEmpresa={porEmpresa} />
      </div>
    </div>
  )
}
