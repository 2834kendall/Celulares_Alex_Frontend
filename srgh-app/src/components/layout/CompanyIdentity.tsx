import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils/cn'
import { CompanyLogo } from '@/components/ui/CompanyLogo'

interface CompanyIdentityProps {
  /** URL firmada del logo de la empresa, o null para mostrar la inicial. */
  logoUrl: string | null
  /** Nombre real de la empresa (cargado server-side desde sgrh_empresas). */
  empresaNombre: string
  /** Sucursal asignada al usuario; null (p.ej. ADMIN) cae al nombre del sistema. */
  sucursalNombre: string | null
  /** `md` en la barra superior de escritorio; `sm` en el drawer y en movil. */
  size?: 'sm' | 'md'
  /** Oculta la linea de la sucursal (barra superior en movil, donde no hay lugar). */
  compact?: boolean
  className?: string
}

const NAME_SIZE = { sm: 'text-sm', md: 'text-base' } as const

/**
 * Logo + nombre de la empresa + sucursal: la identidad del shell.
 *
 * Antes estaba copiada a mano en el sidebar y en el drawer movil. Ahora la
 * usan la barra superior y el drawer. El nombre se trunca y lleva `title`, asi
 * un nombre largo se sigue pudiendo leer completo.
 */
export function CompanyIdentity({
  logoUrl,
  empresaNombre,
  sucursalNombre,
  size = 'md',
  compact = false,
  className,
}: CompanyIdentityProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <CompanyLogo logoUrl={logoUrl} nombre={empresaNombre} size={size} />
      <div className="min-w-0 leading-tight">
        <p
          title={empresaNombre}
          className={cn(
            'truncate font-extrabold tracking-tight text-[var(--sidebar-text-strong)]',
            NAME_SIZE[size]
          )}
        >
          {empresaNombre}
        </p>
        {!compact && (
          <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
            {sucursalNombre ?? BRAND.sistema}
          </p>
        )}
      </div>
    </div>
  )
}
