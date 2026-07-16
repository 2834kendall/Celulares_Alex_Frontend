import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'

interface PayrollHeaderProps {
  canWrite: boolean
}

/** Encabezado de la pantalla de nómina: título + acción de nuevo periodo. */
export function PayrollHeader({ canWrite }: PayrollHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-bold text-slate-900">Nómina</h1>
        <p className="text-xs text-slate-500">
          Periodos de planilla, ingresos, deducciones y comprobantes de pago.
        </p>
      </div>
      {canWrite && (
        <Link
          href="/payroll/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Nuevo periodo
        </Link>
      )}
    </div>
  )
}
