import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { ConceptosList } from '@/modules/payroll/components/ConceptosList'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

/**
 * Gestión del catálogo de conceptos de nómina. Es una pantalla de
 * configuración: requiere CATALOGOS_WRITE (no solo NOMINA_WRITE) porque
 * afecta a todas las planillas de la empresa, no a un periodo puntual.
 */
export default async function PayrollConceptsPage() {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const conceptosResult = await getConceptos()

  if (!conceptosResult.ok) {
    return <ErrorBanner message={conceptosResult.error} />
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
          <h1 className="text-base font-bold text-slate-900">Conceptos de nómina</h1>
          <p className="text-xs text-slate-500">
            Crea, edita o elimina los conceptos usados al procesar la planilla.
          </p>
        </div>
      </div>

      <ConceptosList conceptos={conceptosResult.data} canWrite />
    </div>
  )
}
