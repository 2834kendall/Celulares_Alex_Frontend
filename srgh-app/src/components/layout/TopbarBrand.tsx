'use client'

import { useEffect, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { CompanyIdentity } from '@/components/layout/CompanyIdentity'
import {
  SIDEBAR_ID,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_TRANSITION,
} from '@/components/layout/sidebarLayout'

/*
 * Misma forma y area tocable que ICON_CONTROL_BASE, pero con los colores de
 * la superficie del sidebar (`--sidebar-*`). No compone sobre el token porque
 * este trae `text-slate-500` y `cn()` no resuelve conflictos de Tailwind: los
 * dos colores quedarian compitiendo.
 */
const COLLAPSE_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-[var(--sidebar-text)] outline-none transition hover:bg-black/5 hover:text-[var(--sidebar-text-strong)] active:scale-90 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60'

interface TopbarBrandProps {
  /** El sidebar esta en modo riel (76px). */
  collapsed: boolean
  onToggle: () => void
  logoUrl: string | null
  empresaNombre: string
  sucursalNombre: string | null
  className?: string
}

/**
 * Columna izquierda de la barra superior en escritorio: la identidad de la
 * empresa, con el mismo ancho que el sidebar (256px expandido, 76px en riel)
 * para leerse como su encabezado. No lleva borde a la derecha: es la misma
 * superficie que el resto de la barra.
 *
 * - Expandido: logo, nombre y sucursal, con el boton de colapsar a la derecha.
 * - Riel: solo el logo, que ES el boton de expandir. Al pasar el puntero (o al
 *   llegar con Tab) el logo se funde en el icono de panel, para que se note
 *   que es un control.
 *
 * El boton que tenia el foco se desmonta al alternar (uno vive en cada
 * estado), asi que el foco volveria al `body`. Si el cambio se hizo con el
 * boton enfocado, se lo devuelve al boton nuevo.
 */
export function TopbarBrand({
  collapsed,
  onToggle,
  logoUrl,
  empresaNombre,
  sucursalNombre,
  className,
}: TopbarBrandProps) {
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)

  useEffect(() => {
    if (refocus.current) {
      refocus.current = false
      toggleRef.current?.focus()
    }
  }, [collapsed])

  function handleToggle(event: React.MouseEvent<HTMLButtonElement>) {
    refocus.current = document.activeElement === event.currentTarget
    onToggle()
  }

  return (
    <div
      className={cn(
        'h-full shrink-0 items-center overflow-hidden',
        SIDEBAR_WIDTH_TRANSITION,
        collapsed ? SIDEBAR_WIDTH.rail : SIDEBAR_WIDTH.expanded,
        className
      )}
    >
      {collapsed ? (
        <div className="flex h-full w-[76px] shrink-0 items-center pl-[18px]">
          <button
            ref={toggleRef}
            type="button"
            onClick={handleToggle}
            aria-label="Expandir menú lateral"
            aria-expanded={false}
            aria-controls={SIDEBAR_ID}
            className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <CompanyLogo
              logoUrl={logoUrl}
              nombre={empresaNombre}
              size="md"
              className="motion-safe:transition-opacity motion-safe:duration-200 group-hover:opacity-0 group-focus-visible:opacity-0"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/5 text-[var(--sidebar-text-strong)] opacity-0 motion-safe:transition-opacity motion-safe:duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </span>
          </button>
        </div>
      ) : (
        // Ancho fijo: al expandir, la columna crece y va destapando el
        // contenido en vez de reacomodarlo en cada cuadro.
        <div className="flex h-full w-64 shrink-0 items-center gap-2 pl-[18px] pr-3">
          <CompanyIdentity
            className="flex-1"
            logoUrl={logoUrl}
            empresaNombre={empresaNombre}
            sucursalNombre={sucursalNombre}
          />
          <button
            ref={toggleRef}
            type="button"
            onClick={handleToggle}
            aria-label="Contraer menú lateral"
            aria-expanded
            aria-controls={SIDEBAR_ID}
            className={COLLAPSE_BUTTON}
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
