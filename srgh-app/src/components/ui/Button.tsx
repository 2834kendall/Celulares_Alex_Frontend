import { cn } from '@/lib/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center font-semibold shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-blue-500/60',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
  md: 'gap-1.5 rounded-xl px-3 py-2 text-xs',
  lg: 'gap-2 rounded-xl px-4 py-2 text-sm',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Ocupa todo el ancho disponible (botones de submit dentro de un formulario). */
  block?: boolean
}

/**
 * Boton de accion.
 *
 * Reemplaza las 14 variantes de `bg-blue-600 ... text-white` que habia sueltas
 * por la aplicacion. Para layout extra (`mt-1`, `shrink-0`, `w-56`) usar
 * `className`; para cambiar tamano o color usar `size`/`variant`, porque `cn()`
 * no resuelve conflictos de Tailwind.
 */
export function Button({
  variant = 'primary',
  size = 'sm',
  block = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...props}
    />
  )
}
