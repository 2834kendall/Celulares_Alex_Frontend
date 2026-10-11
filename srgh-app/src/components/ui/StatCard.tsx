import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CARD, CARD_HOVER } from '@/components/ui/styles'

export type StatTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate'

const TONES: Record<StatTone, string> = {
  blue: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-500',
}

interface StatCardProps {
  icon: LucideIcon
  tone?: StatTone
  label: string
  value: React.ReactNode
  /** Resalta el borde al pasar el mouse (tarjetas de una fila clicable). */
  hoverable?: boolean
  /**
   * Convierte la tarjeta en un botón (ej. filtrar el listado por lo que
   * cuenta). Antes las tarjetas `hoverable` parecían botones y no hacían nada.
   */
  onClick?: () => void
  /** Con `onClick`: el filtro de esta tarjeta es el que está aplicado. */
  active?: boolean
  className?: string
}

/**
 * Tarjeta de metrica de las cabeceras de listado.
 *
 * El bloque icono + etiqueta + valor estaba repetido en cinco modulos, y el
 * `tabular-nums` del valor —que es lo que evita que el numero baile entre
 * tarjetas— se perdia en algunas copias.
 */
export function StatCard({
  icon: Icon,
  tone = 'blue',
  label,
  value,
  hoverable = false,
  onClick,
  active = false,
  className,
}: StatCardProps) {
  const contenido = (
    <>
      <div
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-slate-500">{label}</p>
        <p className="text-base font-bold tabular-nums text-slate-900">{value}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          'flex w-full items-center gap-2.5 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2',
          CARD_HOVER,
          active && 'border-brand-300 ring-2 ring-brand-500/20 hover:border-brand-300',
          className
        )}
      >
        {contenido}
      </button>
    )
  }

  return (
    <div className={cn('flex items-center gap-2.5 p-3', hoverable ? CARD_HOVER : CARD, className)}>
      {contenido}
    </div>
  )
}
