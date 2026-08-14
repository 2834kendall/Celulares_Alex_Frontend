import { cn } from '@/lib/utils/cn'

export type BadgeTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'orange' | 'rose'
export type BadgeSize = 'xs' | 'sm'

const TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const SIZES: Record<BadgeSize, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
}

interface BadgeProps {
  tone?: BadgeTone
  /** `xs` dentro de tablas, `sm` en tarjetas y encabezados. */
  size?: BadgeSize
  children: React.ReactNode
  className?: string
}

/**
 * Pastilla de estado.
 *
 * La paleta de tonos ya existia repetida en tres mapas distintos
 * (`ESTADO_BADGE` en payroll, `BADGE_TONES` y `TONE_CLASSES` en evaluations);
 * esta es la fuente unica. Los mapas de dominio siguen viviendo en su modulo,
 * pero ahora resuelven a un `BadgeTone` en vez de a un string de clases.
 */
export function Badge({ tone = 'slate', size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ring-1 ring-inset',
        TONES[tone],
        SIZES[size],
        className
      )}
    >
      {children}
    </span>
  )
}
