import { cn } from '@/lib/utils/cn'

export type IconButtonTone = 'slate' | 'blue' | 'rose'

// El area tocable crece con `pointer-coarse:` y no con un breakpoint: lo que
// decide si 26px alcanzan es el DEDO, no el ancho de pantalla. Una laptop
// tactil de 1280px necesita los 44px de WCAG 2.5.5 igual que un telefono, y
// un mouse en 375px no los necesita. El icono no cambia de tamaño: solo se
// agranda el area, asi que la densidad visual del escritorio queda intacta.
/**
 * Forma y area tocable de un control de solo icono.
 *
 * Se exporta porque no todos son `<button>`: PageHeader usa un `<Link>` para
 * volver, y sin compartir estas clases ese enlace se quedaba en ~26px
 * mientras el resto crecia a 44px. El token es la unica fuente de verdad.
 */
export const ICON_CONTROL_BASE =
  'inline-flex items-center justify-center rounded-full p-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-slate-500 outline-none transition active:scale-90 motion-reduce:active:scale-100 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

export const ICON_CONTROL_TONES: Record<IconButtonTone, string> = {
  slate: 'hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-blue-500/60',
  blue: 'hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-blue-500/60',
  rose: 'hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-rose-500/60',
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Color del hover: neutro, accion o accion destructiva. */
  tone?: IconButtonTone
  /** Obligatorio: el boton solo contiene un icono, necesita nombre accesible. */
  'aria-label': string
  /** React 19 pasa `ref` como prop normal, sin forwardRef. Lo necesita quien
   *  deba devolver el foco al boton (ej. al cerrar un popover). */
  ref?: React.Ref<HTMLButtonElement>
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
  return (
    <button
      type={type}
      className={cn(ICON_CONTROL_BASE, ICON_CONTROL_TONES[tone], className)}
      {...props}
    />
  )
}
