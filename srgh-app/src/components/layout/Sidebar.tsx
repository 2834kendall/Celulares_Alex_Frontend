'use client'

import { NavLinks } from '@/components/layout/NavLinks'
import { BRAND } from '@/lib/brand'

interface SidebarProps {
  /** Permisos del JWT, leidos server-side en el layout del dashboard. */
  permisos: string[]
  /** Nombre real de la empresa (cargado server-side desde sgrh_empresas). */
  empresaNombre: string
  /** Sucursal asignada al usuario, o null si no tiene una fija (p.ej. ADMIN). */
  sucursalNombre: string | null
  /** Colapsable en escritorio desde la hamburguesa del topbar. */
  open?: boolean
}

/**
 * Sidebar de escritorio con colapso animado (transicion de ancho) para
 * aprovechar la pantalla completa. En movil se oculta siempre — ahi se
 * usa el drawer del AppShell.
 */
export function Sidebar({ permisos, empresaNombre, sucursalNombre, open = true }: SidebarProps) {
  return (
    <aside
      // inert al colapsar: el contenido queda para la animacion pero
      // fuera del tab-order y de los lectores de pantalla
      inert={!open}
      className={`hidden md:block sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r bg-white transition-[width] duration-300 ease-in-out ${
        open ? 'w-64 border-slate-200' : 'w-0 border-transparent'
      }`}
    >
      {/* Ancho fijo interno para que el contenido no se deforme durante la animacion */}
      <div className="flex h-full w-64 flex-col">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-sm font-black text-white">
            {empresaNombre.charAt(0)}
          </span>
          <div className="leading-tight">
            <p className="whitespace-nowrap text-base font-extrabold tracking-tight text-slate-900">
              {empresaNombre}
            </p>
            <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {sucursalNombre ?? BRAND.sistema}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks permisos={permisos} />
        </div>
      </div>
    </aside>
  )
}
