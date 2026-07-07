'use client'

import { NavLinks } from '@/components/layout/NavLinks'

interface SidebarProps {
  /** Permisos del JWT, leidos server-side en el layout del dashboard. */
  permisos: string[]
}

/**
 * Sidebar fijo de escritorio (oculto en movil — ahi se usa el drawer del AppShell).
 * Solo muestra las zonas que los permisos del usuario autorizan.
 */
export function Sidebar({ permisos }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white">
          S
        </span>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-slate-900">SGRH</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Talento & Planillas
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks permisos={permisos} />
      </div>

      <div className="border-t border-slate-100 p-4">
        <p className="text-[10px] font-semibold text-slate-400">Entorno seguro</p>
        <p className="text-[10px] text-slate-300">Costa Rica · UTC-6</p>
      </div>
    </aside>
  )
}
