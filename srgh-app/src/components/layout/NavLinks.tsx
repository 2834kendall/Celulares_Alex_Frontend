'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote,
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

const ICONOS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  employees: Users,
  attendance: CalendarClock,
  schedule: Clock,
  payroll: Banknote,
  recruitment: UserSearch,
  evaluations: ClipboardCheck,
  settings: Settings,
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
        const Icon = ICONOS[key] ?? LayoutDashboard
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-brand-700 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
