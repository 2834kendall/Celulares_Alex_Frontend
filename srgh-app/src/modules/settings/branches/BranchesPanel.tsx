'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { INPUT_CLASSES } from '@/modules/employees/components/EmployeeFields'
import type { BranchSettings } from './types'

export function BranchesPanel({ data }: { data: BranchSettings }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('todas')
  const branches = data.branches.filter(
    (b) =>
      (status === 'todas' || b.suc_activa === (status === 'activas')) &&
      `${b.suc_nombre} ${b.suc_codigo_interno ?? ''}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
  )
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href="/settings/branches/new"
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
            placeholder="Buscar por nombre o código"
            type="search"
          />
        </label>
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
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {branches.map((b) => (
            <li key={b.suc_id}>
              <Link
                href={`/settings/branches/${b.suc_id}`}
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
      )}
    </div>
  )
}
