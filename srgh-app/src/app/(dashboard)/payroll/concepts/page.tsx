import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { ConceptosList } from '@/modules/payroll/components/ConceptosList'
import { Alert } from '@/components/ui/Alert'
import { PageHeader } from '@/components/ui/PageHeader'

/**
 * Gestión del catálogo de conceptos de nómina. Es una pantalla de
 * configuración: requiere CATALOGOS_WRITE (no solo NOMINA_WRITE) porque
 * afecta a todas las planillas de la empresa, no a un periodo puntual.
 */
export default async function PayrollConceptsPage() {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const conceptosResult = await getConceptos()

  if (!conceptosResult.ok) {
    return <Alert size="md">{conceptosResult.error}</Alert>
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/payroll"
        backLabel="Volver a nómina"
        title="Conceptos de nómina"
        description="Crea, edita o elimina los conceptos usados al procesar la planilla."
      />

      <ConceptosList conceptos={conceptosResult.data} canWrite />
    </div>
  )
}
