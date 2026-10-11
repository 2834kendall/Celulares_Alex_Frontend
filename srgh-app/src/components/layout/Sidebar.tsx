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
 * reemplaza por el de Configuración, con "← Volver". Se reduce al riel igual
 * que el principal: la cabecera deja solo el engranaje, el buscador queda como
 * lupa y cada módulo abre sus subpáginas en un panel (ver SettingsSidebarNav).
 */

/* Scroller del menu, comun a los dos modos. `overflow-x-hidden`: sin el,
   aparece una barra horizontal mientras el ancho se anima. `px-[18px]` pone
   los iconos del riel en x = 38, el centro de sus 76px. */
const RAIL_SCROLL = 'overflow-x-hidden overflow-y-auto px-[18px] py-4'
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
        <div className="flex h-full flex-col">
          {/* Modo configuración: cabecera en el color de acento y el menú entra
              deslizándose, para que se note que ya no es el menú principal.
              Con `px-[18px]` el engranaje queda en el eje de los íconos. */}
          <div className="overflow-hidden border-b border-brand-800 bg-brand-700 px-[18px] py-5 whitespace-nowrap">
            <SettingsModeHeader empresaNombre={empresaNombre} collapsed={collapsed} />
          </div>
          <RailTooltipArea
            enabled={collapsed}
            className={cn('min-h-0 flex-1', RAIL_SCROLL, collapsed && '[scrollbar-width:none]')}
          >
            <div className="animate-slide-in-left">
              <SettingsSidebarNav
                permisos={permisos}
                collapsed={collapsed}
                onOpenSearch={onOpenSettingsSearch}
              />
            </div>
          </RailTooltipArea>
        </div>
      ) : (
        <RailTooltipArea
          enabled={collapsed}
          // En el riel se oculta la barra vertical: en Windows ocupa ancho y
          // descentraria los iconos (el scroll sigue).
          className={cn('h-full', RAIL_SCROLL, collapsed && '[scrollbar-width:none]')}
        >
          <NavLinks permisos={permisos} collapsed={collapsed} />
        </RailTooltipArea>
      )}
    </aside>
  )
}
