import { cn } from '@/lib/utils/cn'

export type IconButtonTone = 'slate' | 'blue' | 'rose'

const BASE =
  'inline-flex items-center justify-center rounded-full p-1.5 text-slate-500 outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50'

const TONES: Record<IconButtonTone, string> = {
  slate: 'hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-blue-500/60',
  blue: 'hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-blue-500/60',
  rose: 'hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-rose-500/60',
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Color del hover: neutro, accion o accion destructiva. */
  tone?: IconButtonTone
  /** Obligatorio: el boton solo contiene un icono, necesita nombre accesible. */
  'aria-label': string
}

/**
 * Boton circular de solo icono (cerrar, editar, eliminar, paginar).
 *
 * Unifica las 13 variantes que existian, que solo se diferenciaban en el color
 * del hover y en como trataban el estado deshabilitado.
 */
export function IconButton({
  tone = 'slate',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return <button type={type} className={cn(BASE, TONES[tone], className)} {...props} />
}
