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
import { zonasVisibles } from '@/lib/permissions/zones'

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
}

/**
 * Lista de enlaces de navegacion filtrada por permisos.
 * Compartida entre el sidebar de escritorio y el drawer movil.
 * Esto es UX, no seguridad — cada page valida con requirePermission().
 */
export function NavLinks({ permisos, onNavigate }: NavLinksProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {zonasVisibles(permisos).map(({ key, href, label }) => {
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
            className={navItemClass(active)}
          >
            <Icon className="nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
