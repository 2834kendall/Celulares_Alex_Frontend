'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { INPUT_CLASSES } from '@/modules/employees/components/EmployeeFields'
import type { Branch, BranchSettings } from './types'

const TODAS = 'todas'

export function BranchesPanel({
  data,
  marcaContextoId = null,
}: {
  data: BranchSettings
  /** Marca elegida en la barra superior: aplica si la URL no dice otra cosa. */
  marcaContextoId?: number | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('todas')
  const brands = data.brands ?? []
  // La marca vive en la URL: desde una marca se llega con el filtro puesto, y
  // volver atrás desde una sucursal lo conserva. Con una marca elegida arriba,
  // "Todas" tiene que quedar escrito en la URL: sin parámetro volvería a mandar esa marca.
  const marcaParam = searchParams.get('marca') ?? (marcaContextoId ? String(marcaContextoId) : null)
  const brand = brands.some((m) => String(m.id) === marcaParam) ? (marcaParam as string) : TODAS
  const todasQuery = marcaContextoId ? `?marca=${TODAS}` : ''
  const listQuery = brand === TODAS ? todasQuery : `?marca=${brand}`
  const setBrand = (value: string) =>
    router.replace(`/settings/branches${value === TODAS ? todasQuery : `?marca=${value}`}`, {
      scroll: false,
    })
  const brandName = (id: number | null) => brands.find((m) => m.id === id)?.nombre ?? ''
  const branches = data.branches.filter(
    (b) =>
      (status === 'todas' || b.suc_activa === (status === 'activas')) &&
      (brand === TODAS || String(b.suc_marca_id) === brand) &&
      `${b.suc_nombre} ${b.suc_codigo_interno ?? ''} ${brandName(b.suc_marca_id)}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
  )
  // Agrupadas por marca, en el orden de las marcas; las que todavía no tienen
  // (solo mientras dura la migración de marcas) van al final.
  const groups: { key: string; title: string; items: Branch[] }[] = [
    ...brands.map((m) => ({
      key: String(m.id),
      title: m.activa ? m.nombre : `${m.nombre} (inactiva)`,
      items: branches.filter((b) => b.suc_marca_id === m.id),
    })),
    {
      key: 'sin-marca',
      title: 'Sin marca',
      items: branches.filter((b) => !brands.some((m) => m.id === b.suc_marca_id)),
    },
  ].filter((g) => g.items.length > 0)
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href={`/settings/branches/new${listQuery}`}
          className="rounded-lg bg-brand-action px-4 py-2 text-sm font-bold text-white hover:bg-brand-action-hover"
        >
          Nueva sucursal
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="grow">
          <span className="sr-only">Buscar sucursal</span>
          <input
            className={INPUT_CLASSES}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por sucursal, código o marca"
            type="search"
          />
        </label>
        {brands.length > 0 && (
          <label>
            <span className="sr-only">Marca</span>
            <select
              className={INPUT_CLASSES}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value={TODAS}>Todas las marcas</option>
              {brands.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.activa ? m.nombre : `${m.nombre} (inactiva)`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="sr-only">Estado de la sucursal</span>
          <select
            className={INPUT_CLASSES}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="todas">Todas las sucursales</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </select>
        </label>
      </div>
      {branches.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
          {data.branches.length
            ? 'No hay sucursales con estos filtros.'
            : 'Todavía no hay sucursales. Creá la primera para configurar sus kioscos.'}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="space-y-2">
            {groups.length > 1 || brands.length > 0 ? (
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {g.title}
              </h2>
            ) : null}
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {g.items.map((b) => (
                <li key={b.suc_id}>
                  <Link
                    href={`/settings/branches/${b.suc_id}${listQuery}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-900">{b.suc_nombre}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {b.suc_codigo_interno || 'Sin código interno'}
                        {data.canManageKiosks
                          ? ` · ${data.kiosks.filter((k) => k.kio_sucursal_id === b.suc_id).length} kioscos`
                          : ''}
                      </p>
                    </div>
                    <Badge tone={b.suc_activa ? 'emerald' : 'slate'}>
                      {b.suc_activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
