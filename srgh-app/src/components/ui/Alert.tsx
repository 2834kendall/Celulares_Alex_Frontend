import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type AlertTone = 'error' | 'info' | 'warning'
export type AlertSize = 'sm' | 'md'

const TONES: Record<AlertTone, { box: string; icon: string; Icon: typeof AlertTriangle }> = {
  error: {
    box: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: 'text-rose-500',
    Icon: AlertTriangle,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: 'text-amber-500',
    Icon: AlertTriangle,
  },
  info: {
    box: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: 'text-slate-400',
    Icon: Info,
  },
}

const SIZES: Record<AlertSize, { box: string; icon: string }> = {
  sm: { box: 'rounded-xl p-3 text-xs', icon: 'mt-0.5 h-3.5 w-3.5' },
  md: { box: 'rounded-2xl px-4 py-3 text-sm', icon: 'mt-0.5 h-4 w-4' },
}

interface AlertProps {
  tone?: AlertTone
  /** `sm` dentro de formularios y tarjetas; `md` a nivel de pagina. */
  size?: AlertSize
  children: React.ReactNode
  className?: string
}

/**
 * Aviso con icono.
 *
 * Reemplaza los dos bloques que estaban copiados por toda la app: el de
 * formulario (21 usos en 20 archivos) y el de pagina (13 usos en 13 archivos),
 * mas la variante neutra informativa.
 *
 * Lleva `role="alert"` siempre: los usos anteriores lo ponian de forma
 * inconsistente y el error de servidor no se anunciaba en la mitad de los
 * formularios.
 */
export function Alert({ tone = 'error', size = 'sm', children, className }: AlertProps) {
  const { box, icon, Icon } = TONES[tone]
  const sizing = SIZES[size]

  return (
    <div role="alert" className={cn('flex items-start gap-2 border', box, sizing.box, className)}>
      <Icon className={cn('shrink-0', icon, sizing.icon)} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
