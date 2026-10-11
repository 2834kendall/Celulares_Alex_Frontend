import { cn } from '@/lib/utils/cn'

type CompanyLogoSize = 'sm' | 'md' | 'xl'

interface CompanyLogoProps {
  /** URL firmada del logo, o null para mostrar la inicial. */
  logoUrl: string | null
  /** Nombre de la empresa: texto alternativo y origen de la inicial. */
  nombre: string
  size?: CompanyLogoSize
  className?: string
}

const SIZE_CLASSES: Record<CompanyLogoSize, string> = {
  sm: 'h-9 w-9 rounded-lg text-xs',
  md: 'h-10 w-10 rounded-xl text-sm',
  xl: 'h-24 w-24 rounded-2xl text-3xl',
}

/**
 * Logo de la empresa (SGRH-92), el equivalente del Avatar del empleado. Un
 * logo no se recorta en círculo: va entero (object-contain) sobre fondo
 * blanco en un cuadrado redondeado. Sin logo cae a la inicial del nombre
 * sobre el color de acento, como antes.
 */
export function CompanyLogo({ logoUrl, nombre, size = 'md', className }: CompanyLogoProps) {
  if (logoUrl) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-slate-900/10',
          SIZE_CLASSES[size],
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado, no un asset del build. */}
        <img src={logoUrl} alt={`Logo de ${nombre}`} className="h-full w-full object-contain p-1" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-brand-700 font-black text-white',
        SIZE_CLASSES[size],
        className
      )}
    >
      {nombre.charAt(0)}
    </span>
  )
}
