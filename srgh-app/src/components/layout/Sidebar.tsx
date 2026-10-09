'use client'

import { usePathname } from 'next/navigation'
import { NavLinks } from '@/components/layout/NavLinks'
import { RailTooltipArea } from '@/components/layout/RailTooltip'
import {
  SIDEBAR_ID,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_TRANSITION,
} from '@/components/layout/sidebarLayout'
import { cn } from '@/lib/utils/cn'
import { SettingsModeHeader } from '@/modules/settings/components/SettingsModeHeader'
import { SettingsSidebarNav } from '@/modules/settings/components/SettingsSidebarNav'
import { isSettingsPath } from '@/modules/settings/lib/returnPath'

interface SidebarProps {
  /** Permisos del JWT, leidos server-side en el layout del dashboard. */
  permisos: string[]
  /** Nombre real de la empresa: lo muestra la cabecera del modo configuración. */
  empresaNombre: string
  /** Riel de iconos (76px) en lugar del menu completo. Lo alterna la barra superior. */
  collapsed?: boolean
  /** Abre el buscador de ajustes; solo se usa en modo configuración. */
  onOpenSettingsSearch: () => void
}

/**
 * Sidebar de escritorio. En movil se oculta siempre — ahi se usa el drawer
 * del AppShell.
 *
 * La identidad de la empresa vive en la barra superior (TopbarBrand), en una
 * columna del mismo ancho que este sidebar, asi que aca queda solo el menu.
 *
 * Colapsado pasa a un riel de iconos de 76px, con el nombre de cada uno en un
 * tooltip. Ya no es `inert`: el riel se usa. El ancho se anima con las mismas
 * clases que la columna de la barra superior (ver sidebarLayout.ts).
 *
 * En /settings… entra en "modo configuración" (SGRH-92): el menú principal se
 * reemplaza por el de Configuración, con "← Volver". Ese menu es un arbol con
 * buscador que no se reduce a iconos, asi que el AppShell nunca lo colapsa.
 */
export function Sidebar({
  permisos,
  empresaNombre,
  collapsed = false,
  onOpenSettingsSearch,
}: SidebarProps) {
  const settingsMode = isSettingsPath(usePathname())

  return (
    <aside
      id={SIDEBAR_ID}
      className={cn(
        'sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] md:block',
        SIDEBAR_WIDTH_TRANSITION,
        collapsed ? SIDEBAR_WIDTH.rail : SIDEBAR_WIDTH.expanded
      )}
    >
      {settingsMode ? (
        // Ancho fijo interno para que el contenido no se deforme
        <div className="flex h-full w-64 flex-col">
          {/* Modo configuración: cabecera en el color de acento y el menú entra
              deslizándose, para que se note que ya no es el menú principal. */}
          <div className="border-b border-brand-800 bg-brand-700 px-5 py-5">
            <SettingsModeHeader empresaNombre={empresaNombre} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="animate-slide-in-left">
              <SettingsSidebarNav permisos={permisos} onOpenSearch={onOpenSettingsSearch} />
            </div>
          </div>
        </div>
      ) : (
        <RailTooltipArea
          enabled={collapsed}
          // `overflow-x-hidden`: sin el, aparece una barra horizontal mientras
          // el ancho se anima. En el riel se oculta la barra vertical: en
          // Windows ocupa ancho y descentraria los iconos (el scroll sigue).
          className={cn(
            'h-full overflow-x-hidden overflow-y-auto px-[18px] py-4',
            collapsed && '[scrollbar-width:none]'
          )}
        >
          <NavLinks permisos={permisos} collapsed={collapsed} />
        </RailTooltipArea>
      )}
    </aside>
  )
}
