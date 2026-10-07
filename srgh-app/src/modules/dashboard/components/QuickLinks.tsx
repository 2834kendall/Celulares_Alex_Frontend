'use client'

import type { CSSProperties, PointerEvent } from 'react'
import Link from 'next/link'
import { ArrowUpRight, LayoutDashboard } from 'lucide-react'
import { NAV_ICONS } from '@/components/layout/NavLinks'
import { zonasVisibles } from '@/lib/permissions/zones'

/* The glow follows the pointer: its position goes to CSS variables on the
   tile itself (see `.dash-tile`), with no state and no re-render. */
function trackPointer(event: PointerEvent<HTMLAnchorElement>) {
  const tile = event.currentTarget
  const box = tile.getBoundingClientRect()
  tile.style.setProperty('--mx', `${event.clientX - box.left}px`)
  tile.style.setProperty('--my', `${event.clientY - box.top}px`)
}

/**
 * Shortcuts to the zones this session can open — the same list the sidebar
 * shows (zonasVisibles), minus the dashboard itself. Like there, this is UX
 * and not security: every page checks its own permission.
 */
export function QuickLinks({ permisos }: { permisos: string[] }) {
  const zonas = zonasVisibles(permisos).filter((zona) => zona.key !== 'dashboard')
  if (zonas.length === 0) return null

  return (
    <nav
      aria-label="Accesos rápidos"
      className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-4"
    >
      {zonas.map(({ key, href, label }, index) => {
        const Icon = NAV_ICONS[key] ?? LayoutDashboard
        return (
          <Link
            key={key}
            href={href}
            onPointerMove={trackPointer}
            className="dash-enter dash-tile group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 transition duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)] active:translate-y-0 active:scale-[0.98]"
            style={{ '--i': index + 3 } as CSSProperties}
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="relative min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {label}
            </span>
            <ArrowUpRight
              className="relative h-4 w-4 shrink-0 -translate-x-1 translate-y-1 text-brand-600 opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
              aria-hidden="true"
            />
          </Link>
        )
      })}
    </nav>
  )
}
