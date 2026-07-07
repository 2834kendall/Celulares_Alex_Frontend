'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote,
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  Settings,
  UserSearch,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PERMISOS, type Permiso } from '@/lib/permissions/catalog'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Visible si el usuario tiene AL MENOS UNO de estos permisos. Vacio = siempre visible. */
  permisos: Permiso[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, permisos: [] },
  { href: '/employees', label: 'Empleados', icon: Users, permisos: [PERMISOS.EMPLEADOS_READ] },
  {
    href: '/attendance',
    label: 'Asistencia',
    icon: CalendarClock,
    permisos: [PERMISOS.ASISTENCIA_READ, PERMISOS.ASISTENCIA_WRITE, PERMISOS.AUSENCIAS_WRITE],
  },
  {
    href: '/payroll',
    label: 'Nomina',
    icon: Banknote,
    permisos: [PERMISOS.NOMINA_READ, PERMISOS.COMPROBANTES_READ],
  },
  {
    href: '/recruitment',
    label: 'Reclutamiento',
    icon: UserSearch,
    permisos: [PERMISOS.RECLUTAMIENTO_READ],
  },
  {
    href: '/evaluations',
    label: 'Evaluaciones',
    icon: ClipboardCheck,
    permisos: [PERMISOS.EVALUACIONES_READ, PERMISOS.EVALUACIONES_WRITE],
  },
  {
    href: '/settings',
    label: 'Configuracion',
    icon: Settings,
    permisos: [
      PERMISOS.EMPRESAS_WRITE,
      PERMISOS.CATALOGOS_WRITE,
      PERMISOS.ROLES_WRITE,
      PERMISOS.USUARIOS_WRITE,
    ],
  },
]

interface SidebarProps {
  /** Permisos del JWT, leidos server-side en el layout del dashboard. */
  permisos: string[]
}

/**
 * Sidebar adaptativo: solo muestra las zonas que los permisos del usuario autorizan.
 * Esto es UX, no seguridad — cada page.tsx debe validar con requirePermission().
 */
export function Sidebar({ permisos }: SidebarProps) {
  const pathname = usePathname()

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.permisos.length === 0 || item.permisos.some((p) => permisos.includes(p))
  )

  return (
    <aside className="w-64 border-r border-slate-200 bg-white p-4 flex flex-col">
      <div className="mb-6">
        <h2 className="font-extrabold text-lg text-slate-900">SGRH</h2>
        <p className="text-xs text-slate-500">Talento & Planillas</p>
      </div>

      <nav className="flex flex-col gap-1">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
