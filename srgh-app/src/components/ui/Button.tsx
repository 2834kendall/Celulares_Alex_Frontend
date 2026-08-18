import { cn } from '@/lib/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/*
 * BASE/VARIANTS/SIZES se exportan porque media app necesita un boton que en
 * realidad es un `<Link>` (ir a /employees/new, a /recruitment...), y este
 * componente renderiza un `<button>`. Sin compartirlos, cada enlace-boton
 * reescribia las clases a mano y se desincronizaba: los de EmployeesHeader,
 * por ejemplo, se habian quedado sin la guarda de `motion-reduce`.
 */

// `motion-reduce:active:scale-100` faltaba: IconButton si respetaba la
// preferencia del sistema y este no, asi que dos controles vecinos se
// comportaban distinto para quien pide menos movimiento.
// `pointer-coarse:min-h-11`: con `size="sm"` (py-1.5) el boton medía 28px de
// alto. Sirve en escritorio, donde se apunta con el mouse, pero no con el
// pulgar — y "sm" es el tamaño por defecto, asi que era casi toda la app.
// Solo crece el alto minimo y solo con dedo: la densidad del escritorio no
// cambia y el texto no se mueve, porque ya estaba centrado.
export const BUTTON_BASE =
  'inline-flex items-center justify-center font-semibold shadow-sm outline-none transition pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 disabled:shadow-sm'

// La sombra sube un escalon en hover solo en los variantes con relleno: en
// `secondary` (fondo blanco, borde gris) una sombra mayor se lee como que la
// tarjeta de atras se movio, no el boton.
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-frame-600 text-white hover:bg-frame-700 hover:shadow-md focus-visible:ring-frame-600',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-brand-500/60',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-md focus-visible:ring-rose-600',
}

export const BUTTON_SIZES: Record<ButtonSize, string> = {
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
 * Reemplaza las 14 variantes de `bg-brand-600 ... text-white` que habia sueltas
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
      className={cn(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        block && 'w-full',
        className
      )}
      {...props}
    />
  )
}
