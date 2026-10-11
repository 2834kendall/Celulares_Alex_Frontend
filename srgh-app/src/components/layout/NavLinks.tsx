'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  Settings,
  UserSearch,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { visibleNavSections } from '@/lib/permissions/zones'
import { cn } from '@/lib/utils/cn'

/**
 * Ícono de cada zona. Exportado para que el modo configuración
 * (SettingsSidebarNav) muestre los mismos íconos que el menú principal.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  employees: Users,
  attendance: CalendarClock,
  schedule: Clock,
  'my-schedule': CalendarCheck,
  payroll: Banknote,
  recruitment: UserSearch,
  evaluations: ClipboardCheck,
  settings: Settings,
}

/**
 * Rotulo de grupo del menu ("Personal", "Empresa"...). Compartido con el modo
 * configuracion para que los dos menus no se desalineen.
 */
export const NAV_GROUP_LABEL =
  'px-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-text)]'

interface NavItemOptions {
  /** Sub-ítem: sangría para alinearse con el texto del padre (sin ícono). */
  indent?: boolean
  /** Texto más fuerte sin fondo: el módulo que contiene la página actual. */
  emphasis?: boolean
}

/**
 * Clase de una fila del menú lateral. Compartida con el modo configuración
 * para que ambos menús se vean exactamente igual. Las variantes salen de acá
 * y no de sumar clases afuera: `cn()` no resuelve conflictos de Tailwind
 * (px-3 contra pl-10 ganaría el que se generó después, no el último escrito).
 */
export function navItemClass(active: boolean, { indent, emphasis }: NavItemOptions = {}): string {
  const padding = indent ? 'pl-10 pr-3' : 'px-3'
  const color = active
    ? 'bg-brand-700 text-white'
    : `${emphasis ? 'text-[var(--sidebar-text-strong)]' : 'text-[var(--sidebar-text)]'} hover:bg-black/5 hover:text-[var(--sidebar-text-strong)]`
  // `nav-item`: gancho del efecto dock de los íconos (ver globals.css).
  return `nav-item flex items-center gap-3 rounded-lg ${padding} py-2 text-sm font-medium transition ${color}`
}

interface NavLinksProps {
  /** Permisos del JWT, leidos server-side en el layout. */
  permisos: string[]
  /** Callback al navegar (ej. cerrar el drawer movil). */
  onNavigate?: () => void
  /**
   * Riel de iconos (sidebar colapsado en escritorio): las etiquetas se
   * vuelven transparentes y los rotulos de grupo pasan a ser una linea.
   */
  collapsed?: boolean
}

/** Fundido de las etiquetas al entrar y salir del riel. */
export const FADE = 'motion-safe:transition-opacity motion-safe:duration-200'

/**
 * Rotulo de un grupo del menu. En el riel se cambia por una linea, con la
 * misma altura en los dos estados: los items no se mueven en vertical.
 */
export function NavGroupHeading({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div className="relative flex h-5 items-center overflow-hidden">
      <p className={cn(NAV_GROUP_LABEL, 'whitespace-nowrap', FADE, collapsed && 'opacity-0')}>
        {label}
      </p>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-2 top-1/2 h-px bg-[var(--sidebar-border)]',
          FADE,
          collapsed ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}

/**
 * Lista de enlaces de navegacion filtrada por permisos y agrupada
 * (Personal / Operación / Administración; Inicio va suelto arriba).
 * Compartida entre el sidebar de escritorio y el drawer movil.
 * Esto es UX, no seguridad — cada page valida con requirePermission().
 *
 * Cada grupo es su propio contenedor, asi que el efecto dock de los vecinos
 * (`.nav-item:hover + .nav-item` en globals.css) se corta en el borde del
 * grupo. Es el mismo comportamiento que ya tiene el menu de Configuracion.
 *
 * En el riel, cada etiqueta queda en el DOM con opacidad 0: sigue siendo el
 * nombre accesible del link, y el `overflow-hidden` del item la recorta. El
 * nombre visible lo da el tooltip del sidebar, que lee `data-tooltip`.
 */
export function NavLinks({ permisos, onNavigate, collapsed = false }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-4">
      {visibleNavSections(permisos).map(({ group, zonas }) => (
        <div key={group?.id ?? 'root'} className="flex flex-col gap-1">
          {group && <NavGroupHeading label={group.label} collapsed={collapsed} />}
          {zonas.map(({ key, href, label }) => {
            const Icon = NAV_ICONS[key] ?? LayoutDashboard
            const active = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={key}
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                // Elige el gesto propio del ícono al pasar el puntero (globals.css).
                data-icon={key}
                data-tooltip={collapsed ? label : undefined}
                className={cn(navItemClass(active), 'overflow-hidden whitespace-nowrap')}
              >
                <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
                <span className={cn(FADE, collapsed && 'opacity-0')}>{label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
