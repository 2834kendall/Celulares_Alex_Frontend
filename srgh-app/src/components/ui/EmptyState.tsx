import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Boton de accion opcional ("Crear el primero", "Limpiar filtros"). */
  action?: React.ReactNode
  className?: string
}

/**
 * Estado vacio de listas y tablas.
 *
 * Habia cuatro formas de esto conviviendo (gap-2 vs gap-2.5, py-8 vs py-10),
 * repetidas en unos quince lugares. Esta es la unica.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center',
        className
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}
