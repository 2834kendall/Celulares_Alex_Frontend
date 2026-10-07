import { Settings } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface SettingsModeHeaderProps {
  /** Nombre de la empresa: debajo del título, para saber qué se configura. */
  empresaNombre: string
  /** Tamaño del drawer móvil (más compacto que el sidebar de escritorio). */
  compact?: boolean
}

/**
 * Identidad del modo configuración (SGRH-92), en la cabecera del sidebar y
 * del drawer móvil. Reemplaza el bloque de la empresa del menú principal con
 * otra cosa a propósito (engranaje, "Configuración", texto claro sobre el
 * color de acento): sin ese cambio no se notaba que el menú ya no era el
 * principal. El fondo lo pone el contenedor (bg-brand-700).
 */
export function SettingsModeHeader({ empresaNombre, compact = false }: SettingsModeHeaderProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          'flex shrink-0 items-center justify-center bg-white/15 text-white',
          compact ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl'
        )}
      >
        <Settings className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <div className="min-w-0 leading-tight">
        <p
          className={cn(
            'whitespace-nowrap font-extrabold tracking-tight text-white',
            compact ? 'text-sm' : 'text-base'
          )}
        >
          Configuración
        </p>
        <p className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-white/80">
          {empresaNombre}
        </p>
      </div>
    </div>
  )
}
