'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Copy, Layers, Lock, Plus, Search, Store } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Tabs, type TabDefinition } from '@/components/ui/Tabs'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { cn } from '@/lib/utils/cn'
import { ASSIGNABLE_PERMISSIONS } from './permissions'
import type { RoleSummary, RolesSettings } from './types'

const TOTAL = ASSIGNABLE_PERMISSIONS.length
const assignable = new Set<string>(ASSIGNABLE_PERMISSIONS)

const linkButton = (variant: 'primary' | 'secondary') =>
  cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES.lg, 'min-h-11')

/**
 * `enPestana`: la tarjeta está dentro de la pestaña de su sucursal (o de
 * «Toda la empresa»), que ya dice dónde aplica: no se repite la sucursal ni
 * «Versión de…», y la versión de un rol se ve con el nombre del rol base.
 */
function RoleCard({ role, enPestana = false }: { role: RoleSummary; enPestana?: boolean }) {
  const nombre = enPestana && role.baseNombre ? role.baseNombre : role.nombre
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
            <span className="break-words font-bold text-slate-900">{nombre}</span>
          ) : (
            <Link
              href={`/settings/roles/${role.id}`}
              className="break-words font-bold text-slate-900 hover:underline"
            >
              {nombre}
            </Link>
          )}
          {!role.sistema && !enPestana && (
            <Badge tone={role.sucursalId ? 'blue' : 'slate'}>
              {role.sucursalNombre ?? (role.sucursalId ? 'Sucursal' : 'Toda la empresa')}
            </Badge>
          )}
          {!role.asignable && <Badge tone="slate">No asignable</Badge>}
        </div>
        {role.baseNombre && !enPestana && (
          <p className="mt-1 text-sm text-slate-600">
            Versión de «{role.baseNombre}» para esta sucursal
          </p>
        )}
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
  return (
    q === '' ||
    normalizeSearchText(role.nombre).includes(q) ||
    normalizeSearchText(role.baseNombre ?? '').includes(q)
  )
}

function RoleList({
  roles,
  vacio,
  enPestana = false,
}: {
  roles: RoleSummary[]
  vacio: string
  enPestana?: boolean
}) {
  if (roles.length === 0)
    return (
      <p
        role="status"
        className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600"
      >
        {vacio}
      </p>
    )
  return (
    <ul className="space-y-3">
      {roles.map((r) => (
        <RoleCard key={r.id} role={r} enPestana={enPestana} />
      ))}
    </ul>
  )
}

/**
 * Roles como aplican en una sucursal: cada rol general (del sistema o de toda
 * la empresa) se reemplaza por su versión de esa sucursal si existe, y al final
 * van los roles creados solo para ella. Así un rol personalizado aparece una
 * vez, no dos.
 */
function rolesDeSucursal(
  sucursalId: number,
  generales: RoleSummary[],
  propios: RoleSummary[]
): RoleSummary[] {
  const deLaSucursal = propios.filter((r) => r.sucursalId === sucursalId)
  const versionDe = new Map(
    deLaSucursal.filter((r) => r.baseId !== null).map((r) => [r.baseId as number, r])
  )
  return [
    ...generales.map((r) => versionDe.get(r.id) ?? r),
    ...deLaSucursal.filter((r) => r.baseId === null),
  ]
}

/** Pestañas globales del sistema: la elegida queda en `?tab=` y sobrevive a recargar. */
function roleTabs(data: RolesSettings, query: string): TabDefinition<string>[] {
  const filtrar = (list: RoleSummary[]) => list.filter((r) => matches(r, query))
  const count = (list: RoleSummary[]) => ` (${list.length})`
  // Los del sistema primero, los creados en la empresa después.
  const generales = [...data.sistema, ...data.propios.filter((r) => r.sucursalId === null)]
  const todas = filtrar([...data.sistema, ...data.propios])
  const empresa = filtrar(generales)
  const sucursales = data.sucursales.filter(
    (s) => s.activa || data.propios.some((r) => r.sucursalId === s.id)
  )

  return [
    {
      id: 'todas',
      label: `Todas${count(todas)}`,
      icon: Layers,
      content: <RoleList roles={todas} vacio="Ningún rol se llama así. Probá con otra palabra." />,
    },
    {
      id: 'empresa',
      label: `Toda la empresa${count(empresa)}`,
      shortLabel: 'Empresa',
      icon: Building2,
      content: (
        <RoleList
          roles={empresa}
          enPestana
          vacio="Ningún rol de toda la empresa coincide con la búsqueda."
        />
      ),
    },
    ...sucursales.map((s) => {
      const roles = filtrar(
        rolesDeSucursal(
          s.id,
          generales.filter((r) => r.asignable),
          data.propios
        )
      )
      return {
        id: `sucursal-${s.id}`,
        label: `${s.nombre}${count(roles)}`,
        icon: Store,
        content: (
          <RoleList
            roles={roles}
            enPestana
            vacio={`Ningún rol de ${s.nombre} coincide con la búsqueda.`}
          />
        ),
      }
    }),
  ]
}

/**
 * Listado de roles en pestañas: todos, los de toda la empresa y los de cada
 * sucursal (como aplican ahí). El buscador filtra dentro de la pestaña.
 */
export function RolesPanel({ data }: { data: RolesSettings }) {
  const [query, setQuery] = useState('')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-slate-600">
          Un rol es un paquete de permisos. Cada usuario tiene uno, y su sucursal decide hasta dónde
          alcanza. Los roles del sistema aplican en todas las sucursales; para cambiar uno solo en
          una sucursal, abrilo y usá «Permisos por sucursal».
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

      <Tabs idPrefix="roles" ariaLabel="Filtrar roles por sucursal" tabs={roleTabs(data, query)} />
    </div>
  )
}
