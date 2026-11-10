'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, Lock, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { cn } from '@/lib/utils/cn'
import { ASSIGNABLE_PERMISSIONS } from './permissions'
import type { RoleSummary, RolesSettings } from './types'

const TOTAL = ASSIGNABLE_PERMISSIONS.length
const assignable = new Set<string>(ASSIGNABLE_PERMISSIONS)

const linkButton = (variant: 'primary' | 'secondary') =>
  cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES.lg, 'min-h-11')

function RoleCard({ role }: { role: RoleSummary }) {
  const permisos = role.permisos.filter((p) => assignable.has(p)).length
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4 sm:p-5',
        role.sistema ? 'bg-slate-50' : 'bg-white'
      )}
    >
      <div className="min-w-0 grow basis-72">
        <div className="flex flex-wrap items-center gap-2">
          {!role.asignable && <Lock aria-hidden="true" className="h-4 w-4 text-slate-500" />}
          {!role.asignable ? (
            <span className="break-words font-bold text-slate-900">{role.nombre}</span>
          ) : (
            <Link
              href={`/settings/roles/${role.id}`}
              className="break-words font-bold text-slate-900 hover:underline"
            >
              {role.nombre}
            </Link>
          )}
          {!role.asignable && <Badge tone="slate">No asignable</Badge>}
        </div>
        {role.descripcion && <p className="mt-1 text-sm text-slate-600">{role.descripcion}</p>}
      </div>
      <dl className="flex shrink-0 gap-7">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Usuarios
          </dt>
          <dd className="text-lg font-semibold text-slate-900">{role.usuarios}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Permisos
          </dt>
          <dd className="text-lg font-semibold text-slate-900">
            {permisos} <span className="text-sm font-medium text-slate-500">de {TOTAL}</span>
          </dd>
        </div>
      </dl>
      <div className="flex shrink-0 flex-wrap gap-2">
        {!role.asignable ? (
          <Link
            href={`/settings/roles/${role.id}`}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand-700 hover:underline"
          >
            Ver permisos
          </Link>
        ) : (
          <>
            <Link href={`/settings/roles/${role.id}`} className={linkButton('secondary')}>
              Editar permisos
            </Link>
            <Link
              href={`/settings/roles/new?desde=${role.id}`}
              aria-label={`Duplicar ${role.nombre}`}
              title="Duplicar"
              className={cn(linkButton('secondary'), 'w-11 px-0')}
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </li>
  )
}

/** El rol coincide si su nombre contiene el texto, sin distinguir mayúsculas ni tildes. */
function matches(role: RoleSummary, query: string): boolean {
  const q = normalizeSearchText(query.trim())
  return q === '' || normalizeSearchText(role.nombre).includes(q)
}

/**
 * Listado de roles con buscador: los de la empresa y, al final, el del kiosco
 * (el único sin empresa que llega a la pantalla).
 *
 * Los roles valen para toda la empresa: no hay filtro por sucursal porque el
 * rol no decide la tienda — eso lo decide la sucursal de cada cuenta.
 */
export function RolesPanel({ data }: { data: RolesSettings }) {
  const [query, setQuery] = useState('')
  const roles = [...data.propios, ...data.sistema].filter((r) => matches(r, query))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-slate-600">
          Un rol es un paquete de permisos. Cada usuario tiene uno, y su sucursal decide hasta dónde
          alcanza. Los roles son de tu empresa: cambiarlos no afecta a otras.
        </p>
        <Link href="/settings/roles/new" className={linkButton('primary')}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Crear rol
        </Link>
      </div>

      <label className="relative block max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        />
        <span className="sr-only">Buscar rol</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar rol por nombre…"
          // Mismas métricas que el buscador de Usuarios y Empleados.
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11"
        />
      </label>

      {roles.length === 0 ? (
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600"
        >
          Ningún rol se llama así. Probá con otra palabra.
        </p>
      ) : (
        <ul aria-label="Roles" className="space-y-3">
          {roles.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </ul>
      )}
    </div>
  )
}
