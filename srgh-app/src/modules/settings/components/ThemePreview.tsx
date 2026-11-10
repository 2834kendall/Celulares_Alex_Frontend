import type { CSSProperties } from 'react'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { deriveBrandTokens, derivePageBackground, deriveSidebarTokens } from '@/lib/utils/color'

/** Tokens del tema para un contenedor: pintan solo lo que queda adentro. */
export function themeTokens(acento: string, sidebar: string): CSSProperties {
  return {
    ...deriveBrandTokens(acento),
    ...deriveSidebarTokens(sidebar),
    '--page-bg': derivePageBackground(sidebar),
  } as CSSProperties
}

interface ThemePreviewProps {
  acento: string
  sidebar: string
  nombre: string
  logoUrl: string | null
}

/**
 * Maqueta pequeña de la app con unos colores. Mientras se eligen no se pinta la
 * app real: el marco quedaba con el color de prueba y mezclado con el nombre y
 * el logo de otra marca.
 */
export function ThemePreview({ acento, sidebar, nombre, logoUrl }: ThemePreviewProps) {
  return (
    <div
      role="img"
      aria-label={`Ejemplo de cómo se verá la app con ${nombre}`}
      style={themeTokens(acento, sidebar)}
      className="flex h-40 overflow-hidden rounded-xl border border-slate-200 bg-[var(--page-bg)]"
    >
      <div className="flex w-[45%] min-w-0 flex-col gap-1 bg-[var(--sidebar-bg)] p-2.5">
        <div className="mb-2 flex min-w-0 items-center gap-1.5">
          <CompanyLogo logoUrl={logoUrl} nombre={nombre} size="sm" className="!h-7 !w-7" />
          <span className="truncate text-[11px] font-bold text-[var(--sidebar-text-strong)]">
            {nombre}
          </span>
        </div>
        <span className="rounded-md bg-brand-action px-2 py-1 text-[11px] font-semibold text-white">
          Inicio
        </span>
        <span className="px-2 py-1 text-[11px] font-semibold text-[var(--sidebar-text)]">
          Empleados
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 p-3">
        <div className="h-12 w-full rounded-lg border border-slate-200 bg-white" />
        <span className="rounded-md bg-brand-action px-2.5 py-1 text-[11px] font-bold text-white">
          Botón principal
        </span>
      </div>
    </div>
  )
}
