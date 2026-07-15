import Link from 'next/link'
import { Briefcase, UserPlus } from 'lucide-react'

interface EmployeesHeaderProps {
  canWrite: boolean
  canAccessRecruitment: boolean
}

/**
 * Encabezado de la pantalla de empleados: título + acciones principales.
 * "Iniciar contratación" es el atajo a la futura ventana de reclutamiento.
 */
export function EmployeesHeader({ canWrite, canAccessRecruitment }: EmployeesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-base font-bold text-slate-900">Empleados</h1>
        <p className="text-xs text-slate-500">
          Gestión del personal: ficha, contrato vigente y acceso al sistema.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canAccessRecruitment && (
          <Link
            href="/recruitment"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-blue-300 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Briefcase className="h-3.5 w-3.5" /> Iniciar contratación
          </Link>
        )}
        {canWrite && (
          <Link
            href="/employees/new"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <UserPlus className="h-3.5 w-3.5" /> Nuevo empleado
          </Link>
        )}
      </div>
    </div>
  )
}
