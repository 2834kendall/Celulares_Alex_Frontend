'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Camera, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { CARD } from '@/components/ui/styles'
import { themeTokens } from '@/modules/settings/components/ThemePreview'
import type { Brand, BrandsEmpresa } from './types'

function coloresTexto(brand: Brand): string {
  const { mco_color_acento: acento, mco_color_sidebar: sidebar } = brand
  if (acento && sidebar) return 'Colores propios'
  if (acento) return 'Acento propio, barra de la empresa'
  if (sidebar) return 'Barra propia, acento de la empresa'
  return 'Colores de la empresa'
}

function sucursalesLink(brand: Brand) {
  const total = brand.sucursales.length
  if (total > 0) {
    return {
      href: `/settings/branches?marca=${brand.mco_id}`,
      label: total === 1 ? 'Ver 1 sucursal' : `Ver ${total} sucursales`,
    }
  }
  // Una marca inactiva no se ofrece al crear sucursales.
  return brand.mco_activa
    ? { href: `/settings/branches/new?marca=${brand.mco_id}`, label: 'Agregar sucursal' }
    : null
}

interface BrandCardProps {
  brand: Brand
  empresa: BrandsEmpresa
  onLogo: () => void
  onEdit: () => void
  onColors: () => void
  onDelete: () => void
  onViewApp: () => void
}

/**
 * La tarjeta muestra la identidad tal como se ve en la app: el logo sobre el
 * color de la barra, y los botones con el acento de la marca. Lo que la marca no
 * personalizó se ve con lo de la empresa, igual que en la app.
 */
export function BrandCard({
  brand,
  empresa,
  onLogo,
  onEdit,
  onColors,
  onDelete,
  onViewApp,
}: BrandCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const nombre = brand.mco_nombre
  const sucursales = sucursalesLink(brand)

  return (
    <li
      className={`${CARD} flex min-w-0 flex-col`}
      style={themeTokens(
        brand.mco_color_acento ?? empresa.acento,
        brand.mco_color_sidebar ?? empresa.sidebar
      )}
    >
      <button
        type="button"
        onClick={onLogo}
        aria-label={`Cambiar logo de ${nombre}`}
        className="group relative flex h-36 w-full items-center justify-center rounded-t-xl bg-[var(--sidebar-bg)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <CompanyLogo logoUrl={brand.logoUrl ?? empresa.logoUrl} nombre={nombre} size="xl" />
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
          <Camera className="h-3 w-3" aria-hidden="true" />
          Cambiar logo
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-base font-bold text-slate-900">{nombre}</p>
          <Badge tone={brand.mco_activa ? 'emerald' : 'slate'}>
            {brand.mco_activa ? 'Activa' : 'Inactiva'}
          </Badge>
        </div>
        <p className="text-xs text-slate-600">
          {brand.logoUrl ? 'Logo propio' : 'Logo de la empresa'} · {coloresTexto(brand)}
        </p>
        {sucursales ? (
          <Link
            href={sucursales.href}
            aria-label={`${sucursales.label} de ${nombre}`}
            className="self-start py-1 text-sm font-semibold text-brand-700 underline"
          >
            {sucursales.label}
          </Link>
        ) : (
          <p className="py-1 text-sm text-slate-600">Sin sucursales</p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            onClick={onEdit}
            size="md"
            className="flex-1 justify-center"
            aria-label={`Editar ${nombre}`}
          >
            Editar
          </Button>
          <Button
            onClick={onColors}
            variant="secondary"
            size="md"
            className="flex-1 justify-center"
            aria-label={`Colores de ${nombre}`}
          >
            Colores
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              onClick={() => setMenuOpen((open) => !open)}
              variant="secondary"
              size="md"
              aria-label={`Más acciones de ${nombre}`}
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
            {menuOpen && (
              <div className="animate-menu-pop absolute bottom-full right-0 z-20 mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {brand.mco_activa && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onViewApp()
                    }}
                    className="block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 pointer-coarse:min-h-11"
                  >
                    Ver la app con esta marca
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                  className="block min-h-9 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 pointer-coarse:min-h-11"
                >
                  Eliminar marca
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
