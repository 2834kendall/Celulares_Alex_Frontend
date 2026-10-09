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
import { NAV_ICONS, navItemClass } from '@/components/layout/NavLinks'
import { cn } from '@/lib/utils/cn'
import { visibleTree, type SettingsModuleId } from '@/modules/settings/lib/sections'
import { DEFAULT_RETURN_PATH, readReturnPath } from '@/modules/settings/lib/returnPath'

/** Los ajustes de Empresa no son zonas del menú principal: íconos propios. */
const COMPANY_ICONS: Record<string, LucideIcon> = {
  profile: Building2,
  general: SlidersHorizontal,
  appearance: Palette,
}

const noopSubscribe = () => () => {}

interface SettingsSidebarNavProps {
  /** Permisos del JWT, leídos server-side en el layout del dashboard. */
  permisos: string[]
  /** Abre el buscador de ajustes (vive en el AppShell, una sola vez). */
  onOpenSearch: () => void
  /** Callback al navegar (ej. cerrar el drawer móvil). */
  onNavigate?: () => void
}

/**
 * Menú del "modo configuración" (SGRH-92): reemplaza al menú principal
 * mientras la ruta es /settings…. Usa la misma fila e íconos que NavLinks
 * para que los módulos se reconozcan como los mismos del menú principal, y
 * sus mismos ganchos (`nav-icon`, `data-icon`) para que los íconos
 * respondan al puntero igual que allá (ver "Dock" en globals.css).
 *
 * Es UX, no seguridad: cada subpágina valida su ajuste y cada acción su
 * permiso.
 */
export function SettingsSidebarNav({
  permisos,
  onOpenSearch,
  onNavigate,
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

  return (
    <div className="flex flex-col gap-3">
      <Link href={returnPath} onClick={onNavigate} data-icon="back" className={navItemClass(false)}>
        <ArrowLeft className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
        Volver al menú principal
      </Link>

      <button
        type="button"
        onClick={onOpenSearch}
        data-icon="search"
        className="nav-item flex items-center gap-2 rounded-lg border border-[var(--sidebar-border)] bg-white/70 px-3 py-2 text-left text-sm text-[var(--sidebar-text)] transition hover:bg-white pointer-coarse:min-h-11"
      >
        <Search className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">Buscar ajuste…</span>
        <kbd className="hidden rounded border border-[var(--sidebar-border)] px-1.5 text-[10px] font-semibold md:inline">
          Ctrl K
        </kbd>
      </button>

      <nav aria-label="Configuración" className="flex flex-col gap-4">
        {tree.company.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
              Empresa
            </p>
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
                  className={navItemClass(active)}
                >
                  <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              )
            })}
          </div>
        )}

        {tree.modules.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]">
              Módulos
            </p>
            {tree.modules.map((mod) => {
              const Icon = NAV_ICONS[mod.id] ?? LayoutDashboard
              const open = isOpen(mod.id)
              const listId = `settings-nav-${mod.id}`
              return (
                <div key={mod.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => setToggled((current) => ({ ...current, [mod.id]: !open }))}
                    data-icon={mod.id}
                    className={cn(
                      navItemClass(false, { emphasis: mod.id === activeModule }),
                      'w-full text-left'
                    )}
                  >
                    <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{mod.label}</span>
                    <ChevronRight
                      className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')}
                      aria-hidden="true"
                    />
                  </button>
                  {open && (
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
                </div>
              )
            })}
          </div>
        )}
      </nav>
    </div>
  )
}
