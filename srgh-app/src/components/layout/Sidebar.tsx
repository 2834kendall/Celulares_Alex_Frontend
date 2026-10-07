'use client'

import { usePathname } from 'next/navigation'
import { NavLinks } from '@/components/layout/NavLinks'
import { BRAND } from '@/lib/brand'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { SettingsModeHeader } from '@/modules/settings/components/SettingsModeHeader'
import { SettingsSidebarNav } from '@/modules/settings/components/SettingsSidebarNav'
import { isSettingsPath } from '@/modules/settings/lib/returnPath'

interface SidebarProps {
  /** Permisos del JWT, leidos server-side en el layout del dashboard. */
  permisos: string[]
  /** Nombre real de la empresa (cargado server-side desde sgrh_empresas). */
  empresaNombre: string
  /** URL firmada del logo de la empresa, o null para mostrar la inicial. */
  logoUrl?: string | null
  /** Sucursal asignada al usuario, o null si no tiene una fija (p.ej. ADMIN). */
  sucursalNombre: string | null
  /** Colapsable en escritorio desde la hamburguesa del topbar. */
  open?: boolean
  /** Abre el buscador de ajustes; solo se usa en modo configuración. */
  onOpenSettingsSearch: () => void
}

/**
 * Sidebar de escritorio con colapso animado (transicion de ancho) para
 * aprovechar la pantalla completa. En movil se oculta siempre — ahi se
 * usa el drawer del AppShell.
 *
 * En /settings… entra en "modo configuración" (SGRH-92): el menú principal se
 * reemplaza por el de Configuración, con "← Volver".
 */
export function Sidebar({
  permisos,
  empresaNombre,
  logoUrl = null,
  sucursalNombre,
  open = true,
  onOpenSettingsSearch,
}: SidebarProps) {
  const settingsMode = isSettingsPath(usePathname())

  return (
    <aside
      // inert al colapsar: el contenido queda para la animacion pero
      // fuera del tab-order y de los lectores de pantalla
      inert={!open}
      className={`hidden md:block sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] transition-[width] duration-300 ease-in-out ${
        open ? 'w-64' : 'w-0 border-transparent'
      }`}
    >
      {/* Ancho fijo interno para que el contenido no se deforme durante la animacion */}
      <div className="flex h-full w-64 flex-col">
        {settingsMode ? (
          // Modo configuración: cabecera en el color de acento y el menú entra
          // deslizándose, para que se note que ya no es el menú principal.
          <div className="border-b border-brand-800 bg-brand-700 px-5 py-5">
            <SettingsModeHeader empresaNombre={empresaNombre} />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 border-b border-[var(--sidebar-border)] px-5 py-5">
            <CompanyLogo logoUrl={logoUrl} nombre={empresaNombre} />
            <div className="leading-tight">
              <p className="whitespace-nowrap text-base font-extrabold tracking-tight text-[var(--sidebar-text-strong)]">
                {empresaNombre}
              </p>
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
                {sucursalNombre ?? BRAND.sistema}
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {settingsMode ? (
            <div className="animate-slide-in-left">
              <SettingsSidebarNav permisos={permisos} onOpenSearch={onOpenSettingsSearch} />
            </div>
          ) : (
            <NavLinks permisos={permisos} />
          )}
        </div>
      </div>
    </aside>
  )
}
