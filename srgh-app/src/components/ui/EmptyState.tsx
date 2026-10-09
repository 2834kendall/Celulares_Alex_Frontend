import { Inbox, SearchX, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type EmptyStateVariant = 'empty' | 'no-results'

interface EmptyStateProps {
  /** Opcional: por defecto `Inbox` (vacío) o `SearchX` (sin resultados). */
  icon?: LucideIcon
  title: string
  description?: string
  /** Boton de accion opcional ("Crear el primero", "Limpiar filtros"). */
  action?: React.ReactNode
  /**
   * `empty`: todavia no hay nada creado. `no-results`: hay datos, pero la
   * busqueda o los filtros no dejan ninguno. Cambia el icono por defecto y el
   * gesto al pasar el puntero.
   */
  variant?: EmptyStateVariant
  /**
   * Caja punteada alrededor (por defecto). `false` cuando el estado ya vive
   * dentro de una tarjeta y un segundo borde sobraria.
   */
  framed?: boolean
  className?: string
}

const DEFAULT_ICON: Record<EmptyStateVariant, LucideIcon> = {
  empty: Inbox,
  'no-results': SearchX,
}

/**
 * Estado vacio de listas y tablas: el mismo componente en todo el sistema,
 * con el texto propio de cada pantalla.
 *
 * Habia cuatro formas de esto conviviendo (gap-2 vs gap-2.5, py-8 vs py-10),
 * repetidas en unos quince lugares. Esta es la unica.
 *
 * La animacion vive en globals.css ("Estados vacíos"), con las mismas guardas
 * que el efecto dock del menu: el badge aparece con el mismo resorte y un
 * anillo en el color de la sucursal; al pasar el puntero, el icono flota
 * (`empty`) o "busca" (`no-results`). No hay nada en movimiento en reposo.
 *
 * `no-results` lleva `role="status"`: aparece en respuesta a lo que el usuario
 * escribe, asi que un lector de pantalla lo anuncia sin mover el foco.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'empty',
  framed = true,
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICON[variant]

  return (
    <div
      data-variant={variant}
      role={variant === 'no-results' ? 'status' : undefined}
      className={cn(
        'empty-state flex flex-col items-center gap-2.5 px-6 py-10 text-center',
        framed && 'rounded-xl border border-dashed border-slate-200 bg-slate-50/60',
        className
      )}
    >
      <span className="empty-state-badge relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="empty-state-copy">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      </div>
      {action && <div className="empty-state-copy">{action}</div>}
    </div>
  )
}
