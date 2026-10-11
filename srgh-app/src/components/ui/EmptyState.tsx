import { Inbox, SearchX, type LucideIcon } from 'lucide-react'
import { StateScene } from '@/components/scene/StateScene'
import { cn } from '@/lib/utils/cn'

export type EmptyStateVariant = 'empty' | 'no-results'

interface EmptyStateProps {
  /**
   * Opcional: por defecto `Inbox` (vacío) o `SearchX` (sin resultados). En
   * `md` va estampado en la caja de la escena de vacío; la de sin resultados
   * tiene su propia lupa y no lo usa.
   */
  icon?: LucideIcon
  title: string
  description?: string
  /** Boton de accion opcional ("Crear el primero", "Limpiar filtros"). */
  action?: React.ReactNode
  /**
   * `empty`: todavia no hay nada creado. `no-results`: hay datos, pero la
   * busqueda o los filtros no dejan ninguno. Cambia la escena (o el icono por
   * defecto, en `sm`) y el gesto al pasar el puntero.
   */
  variant?: EmptyStateVariant
  /**
   * `md` (por defecto): escena ilustrada, para el estado de una lista o
   * pantalla. `sm`: fila compacta con icono, sin escena, para espacios chicos
   * o repetidos (widgets del dashboard, columnas de un tablero, modales).
   */
  size?: 'md' | 'sm'
  /**
   * Caja alrededor (por defecto): punteada en `md`, un fondo gris en `sm`.
   * `false` cuando el estado ya vive dentro de una tarjeta y sobraria.
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
 * En `md` lleva una escena con las figuras del login (StateScene): una que
 * dormita junto a una caja vacia con el icono de la pantalla, o una
 * desconcertada con una lupa cuando la busqueda no encuentra nada. Cada
 * escena corre su propia simulacion de la mirada, por eso los lugares donde
 * puede haber varios a la vez usan `sm`.
 *
 * En `sm`, el badge de siempre: aparece con el resorte del dock y un anillo en
 * el color de la sucursal; al pasar el puntero el icono flota (`empty`) o
 * "busca" (`no-results`). Ver "Estados vacíos" en globals.css.
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
  size = 'md',
  framed = true,
  className,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICON[variant]
  const role = variant === 'no-results' ? 'status' : undefined

  if (size === 'sm') {
    return (
      <div
        data-variant={variant}
        role={role}
        className={cn(
          'empty-state flex items-center gap-3 text-left',
          framed && 'rounded-xl bg-slate-50 p-4',
          className
        )}
      >
        <span className="empty-state-badge relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="empty-state-copy min-w-0">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action && <div className="empty-state-copy ml-auto shrink-0">{action}</div>}
      </div>
    )
  }

  return (
    <div
      data-variant={variant}
      role={role}
      className={cn(
        'empty-state flex flex-col items-center gap-2.5 px-6 py-8 text-center',
        framed && 'rounded-xl border border-dashed border-slate-200 bg-slate-50/60',
        className
      )}
    >
      <div className="relative h-28 w-48">
        {variant === 'no-results' ? (
          <StateScene kind="no-results" />
        ) : (
          <StateScene kind="empty">
            <Icon width={24} height={24} />
          </StateScene>
        )}
      </div>
      <div className="empty-state-copy">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      </div>
      {action && <div className="empty-state-copy">{action}</div>}
    </div>
  )
}
