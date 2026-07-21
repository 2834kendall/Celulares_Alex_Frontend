import Link from 'next/link'
import { CalendarPlus, Coins } from 'lucide-react'

interface PayrollHeaderProps {
  canWrite: boolean
  /** CATALOGOS_WRITE: gestiona el catálogo de conceptos, no solo periodos. */
  canManageConceptos: boolean
}

/** Encabezado de la pantalla de nómina: título + acciones principales. */
export function PayrollHeader({ canWrite, canManageConceptos }: PayrollHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-bold text-slate-900">Nómina</h1>
        <p className="text-xs text-slate-500">
          Periodos de planilla, ingresos, deducciones y comprobantes de pago.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canManageConceptos && (
          <Link
            href="/payroll/concepts"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-blue-300 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Coins className="h-3.5 w-3.5" /> Conceptos de nómina
          </Link>
        )}
        {canWrite && (
          <Link
            href="/payroll/new"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Nuevo periodo
          </Link>
        )}
      </div>
    </div>
  )
}
