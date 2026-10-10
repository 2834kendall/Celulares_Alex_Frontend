'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  LayoutDashboard,
  Palette,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { FADE, NAV_ICONS, NavGroupHeading, navItemClass } from '@/components/layout/NavLinks'
import { RailFlyout, railFlyoutItemClass } from '@/components/layout/RailFlyout'
import { cn } from '@/lib/utils/cn'
import { visibleTree, type SettingsModuleId } from '@/modules/settings/lib/sections'
import { DEFAULT_RETURN_PATH, readReturnPath } from '@/modules/settings/lib/returnPath'

/** Los ajustes de Empresa no son zonas del menú principal: íconos propios. */
const COMPANY_ICONS: Record<string, LucideIcon> = {
  profile: Building2,
  general: SlidersHorizontal,
  appearance: Palette,
}

/* Filas que se reducen al ícono en el riel: la etiqueta se recorta, no salta de línea. */
const ROW = 'overflow-hidden whitespace-nowrap'

const noopSubscribe = () => () => {}

interface SettingsSidebarNavProps {
  /** Permisos del JWT, leídos server-side en el layout del dashboard. */
  permisos: string[]
  /** Abre el buscador de ajustes (vive en el AppShell, una sola vez). */
  onOpenSearch: () => void
  /** Callback al navegar (ej. cerrar el drawer móvil). */
  onNavigate?: () => void
  /** Riel de íconos (sidebar colapsado en escritorio). El drawer no lo usa. */
  collapsed?: boolean
}

/** Panel abierto en el riel: de qué módulo, junto a qué botón y si se abrió con teclado. */
interface OpenFlyout {
  id: SettingsModuleId
  anchor: HTMLElement
  focus: boolean
}

/**
 * Menú del "modo configuración" (SGRH-92): reemplaza al menú principal
 * mientras la ruta es /settings…. Usa la misma fila e íconos que NavLinks
 * para que los módulos se reconozcan como los mismos del menú principal, y
 * sus mismos ganchos (`nav-icon`, `data-icon`) para que los íconos
 * respondan al puntero igual que allá (ver "Dock" en globals.css).
 *
 * En el riel se reduce como el menú principal: etiquetas transparentes (siguen
 * siendo el nombre accesible), tooltips por `data-tooltip` y rótulos de grupo
 * convertidos en línea. El buscador queda como una lupa. Las subpáginas de un
 * módulo no tienen ícono propio, así que el módulo abre un panel al costado
 * (RailFlyout) en lugar de desplegarse en línea.
 *
 * Es UX, no seguridad: cada subpágina valida su ajuste y cada acción su
 * permiso.
 */
export function SettingsSidebarNav({
  permisos,
  onOpenSearch,
  onNavigate,
  collapsed = false,
}: SettingsSidebarNavProps) {
  const pathname = usePathname()
  const tree = visibleTree(permisos)

  // sessionStorage solo existe en el cliente: en el servidor (y en la
  // hidratación) el enlace apunta al inicio, y después al valor guardado.
  const returnPath = useSyncExternalStore(noopSubscribe, readReturnPath, () => DEFAULT_RETURN_PATH)

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const activeModule = tree.modules.find((mod) =>
    mod.children.some((leaf) => isActive(leaf.href))
  )?.id

  // El módulo de la página actual arranca desplegado; los demás, plegados.
  // Lo que el usuario despliega o pliega a mano manda sobre ese default.
  const [toggled, setToggled] = useState<Partial<Record<SettingsModuleId, boolean>>>({})
  const isOpen = (id: SettingsModuleId) => toggled[id] ?? id === activeModule

  // Al expandir el riel el panel deja de tener sentido (los módulos vuelven a
  // desplegarse en línea): se descarta sin un efecto que lo cierre.
  const [flyout, setFlyout] = useState<OpenFlyout | null>(null)
  const openFlyout = collapsed ? flyout : null

  const fade = cn(FADE, collapsed && 'opacity-0')

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={returnPath}
        onClick={onNavigate}
        data-icon="back"
        data-tooltip={collapsed ? 'Volver al menú principal' : undefined}
        className={cn(navItemClass(false), ROW)}
      >
        <ArrowLeft className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={fade}>Volver al menú principal</span>
      </Link>

      {/* `px-[11px]` y no px-3: con el borde de 1px, la lupa queda en el
          mismo eje que los demás íconos del riel. */}
      <button
        type="button"
        onClick={onOpenSearch}
        data-icon="search"
        data-tooltip={collapsed ? 'Buscar ajuste (Ctrl K)' : undefined}
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          'nav-item flex items-center gap-2 rounded-lg border border-[var(--sidebar-border)] bg-white/70 px-[11px] py-2 text-left text-sm text-[var(--sidebar-text)] transition hover:bg-white pointer-coarse:min-h-11',
          ROW
        )}
      >
        <Search className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={cn('flex-1', fade)}>Buscar ajuste…</span>
        <kbd
          className={cn(
            'hidden rounded border border-[var(--sidebar-border)] px-1.5 text-[10px] font-semibold md:inline',
            fade
          )}
        >
          Ctrl K
        </kbd>
      </button>

      <nav aria-label="Configuración" className="flex flex-col gap-4">
        {tree.company.length > 0 && (
          <div className="flex flex-col gap-1">
            <NavGroupHeading label="Empresa" collapsed={collapsed} />
            {tree.company.map(({ id, href, label }) => {
              const Icon = COMPANY_ICONS[id] ?? SlidersHorizontal
              const active = isActive(href)
              return (
                <Link
                  key={id}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  data-icon={`settings-${id}`}
                  data-tooltip={collapsed ? label : undefined}
                  className={cn(navItemClass(active), ROW)}
                >
                  <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={fade}>{label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {tree.modules.length > 0 && (
          <div className="flex flex-col gap-1">
            <NavGroupHeading label="Módulos" collapsed={collapsed} />
            {tree.modules.map((mod) => {
              const Icon = NAV_ICONS[mod.id] ?? LayoutDashboard
              const open = isOpen(mod.id)
              const current = mod.id === activeModule
              const flyoutOpen = openFlyout?.id === mod.id
              const listId = `settings-nav-${mod.id}`
              const panelId = `settings-flyout-${mod.id}`
              return (
                <div key={mod.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-expanded={collapsed ? flyoutOpen : open}
                    aria-controls={collapsed ? panelId : listId}
                    onClick={(event) => {
                      if (!collapsed) {
                        setToggled((toggledNow) => ({ ...toggledNow, [mod.id]: !open }))
                        return
                      }
                      // Clic de teclado (Enter/Espacio): detail === 0.
                      const next = {
                        id: mod.id,
                        anchor: event.currentTarget,
                        focus: event.detail === 0,
                      }
                      setFlyout((now) => (now?.id === mod.id ? null : next))
                    }}
                    data-icon={mod.id}
                    // Con el panel abierto, su encabezado ya dice el nombre.
                    data-tooltip={collapsed && !flyoutOpen ? mod.label : undefined}
                    // En el riel no hay lista en línea que muestre la página
                    // actual: el módulo que la contiene se marca entero.
                    className={cn(
                      navItemClass(collapsed && current, { emphasis: !collapsed && current }),
                      'w-full text-left',
                      ROW
                    )}
                  >
                    <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className={cn('flex-1', fade)}>{mod.label}</span>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 transition-transform',
                        open && 'rotate-90',
                        collapsed && 'invisible'
                      )}
                      aria-hidden="true"
                    />
                  </button>

                  {!collapsed && open && (
                    <ul id={listId} className="flex flex-col gap-1">
                      {mod.children.map(({ id, href, label }) => {
                        const active = isActive(href)
                        return (
                          <li key={id}>
                            <Link
                              href={href}
                              onClick={onNavigate}
                              aria-current={active ? 'page' : undefined}
                              className={navItemClass(active, { indent: true })}
                            >
                              {label}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {flyoutOpen && (
                    <RailFlyout
                      id={panelId}
                      label={mod.label}
                      anchor={openFlyout.anchor}
                      focusOnOpen={openFlyout.focus}
                      onClose={() => setFlyout(null)}
                    >
                      <ul className="flex flex-col gap-0.5">
                        {mod.children.map(({ id, href, label }) => {
                          const active = isActive(href)
                          return (
                            <li key={id}>
                              <Link
                                href={href}
                                onClick={() => {
                                  setFlyout(null)
                                  onNavigate?.()
                                }}
                                aria-current={active ? 'page' : undefined}
                                className={railFlyoutItemClass(active)}
                              >
                                {label}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </RailFlyout>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </nav>
    </div>
  )
}
