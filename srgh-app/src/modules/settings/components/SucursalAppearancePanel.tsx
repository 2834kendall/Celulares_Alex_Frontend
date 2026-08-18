'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CARD } from '@/components/ui/styles'
import { SucursalAppearanceForm } from '@/modules/settings/components/SucursalAppearanceForm'
import type { SucursalConApariencia } from '@/lib/empresa/list-sucursales'

const DEFAULT_ACCENT = '#0891b2'
const DEFAULT_SIDEBAR = '#eef1f4'

interface SucursalAppearancePanelProps {
  sucursales: SucursalConApariencia[]
  /**
   * Sucursal propia del admin, si tiene una asignada ademas de administrar
   * la empresa — se preselecciona en vez de la primera de la lista, pero
   * puede elegir cualquier otra igual.
   */
  sucursalIdInicial?: number | null
  /**
   * Tema OFICIAL que el shell esta pintando ahora mismo (sucursal fija o la
   * que este en preview desde el selector de la barra superior) — se
   * reenvia hasta `SucursalAppearanceForm`, que restaura estos colores al
   * salir de la edicion. Ver resolve-shell-theme.ts.
   */
  officialColorAcento: string | null
  officialColorSidebar: string | null
}

/**
 * Para quien administra la EMPRESA (permiso `EMPRESAS_WRITE`): ve TODAS las
 * sucursales de su empresa (la "tienda" con la que inició sesión), tenga o
 * no ademas una sucursal fija propia, elige una, y le edita la apariencia
 * con el mismo formulario que usa un usuario de sucursal fija sin ese
 * permiso.
 */
export function SucursalAppearancePanel({
  sucursales,
  sucursalIdInicial,
  officialColorAcento,
  officialColorSidebar,
}: SucursalAppearancePanelProps) {
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(
    sucursalIdInicial ?? sucursales[0]?.id ?? null
  )
  const seleccionada = sucursales.find((s) => s.id === seleccionadaId) ?? null

  if (sucursales.length === 0) {
    return (
      <p className="max-w-md text-sm text-slate-500">
        Tu empresa todavía no tiene sucursales activas para personalizar.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div className={`${CARD} w-full shrink-0 p-2 md:w-64`}>
        <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Sucursales de tu empresa
        </p>
        <div className="flex flex-col gap-1">
          {sucursales.map((sucursal) => {
            const activa = sucursal.id === seleccionadaId
            return (
              <button
                key={sucursal.id}
                type="button"
                onClick={() => setSeleccionadaId(sucursal.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium outline-none transition',
                  activa
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{sucursal.nombre}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: sucursal.colorAcento ?? DEFAULT_ACCENT }}
                    aria-hidden="true"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: sucursal.colorSidebar ?? DEFAULT_SIDEBAR }}
                    aria-hidden="true"
                  />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {seleccionada && (
        <SucursalAppearanceForm
          // `key` fuerza el remonte al cambiar de sucursal: sin el, el
          // formulario conservaria en su estado los colores de la sucursal
          // anterior en vez de arrancar con los de la recien elegida.
          key={seleccionada.id}
          sucursalId={seleccionada.id}
          sucursalNombre={seleccionada.nombre}
          colorAcentoActual={seleccionada.colorAcento}
          colorSidebarActual={seleccionada.colorSidebar}
          officialColorAcento={officialColorAcento}
          officialColorSidebar={officialColorSidebar}
        />
      )}
    </div>
  )
}
