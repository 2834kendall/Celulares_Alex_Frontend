import Link from 'next/link'
import { Copy, Lock, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
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
          {role.sistema && <Lock aria-hidden="true" className="h-4 w-4 text-slate-500" />}
          {role.sistema ? (
            <span className="break-words font-bold text-slate-900">{role.nombre}</span>
          ) : (
            <Link
              href={`/settings/roles/${role.id}`}
              className="break-words font-bold text-slate-900 hover:underline"
            >
              {role.nombre}
            </Link>
          )}
          {!role.sistema && (
            <Badge tone={role.sucursalId ? 'blue' : 'slate'}>
              {role.sucursalNombre ?? (role.sucursalId ? 'Sucursal' : 'Toda la empresa')}
            </Badge>
          )}
          {!role.asignable && <Badge tone="slate">No asignable</Badge>}
        </div>
        {role.baseNombre && (
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
        {role.sistema ? (
          <>
            <Link href={`/settings/roles/new?desde=${role.id}`} className={linkButton('secondary')}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              Duplicar
            </Link>
            <Link
              href={`/settings/roles/${role.id}`}
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-brand-700 hover:underline"
            >
              {role.asignable ? 'Permisos por sucursal' : 'Ver permisos'}
            </Link>
          </>
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

/** Listado de roles: los propios de la empresa (editables) y los del sistema. */
export function RolesPanel({ data }: { data: RolesSettings }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-slate-600">
          Un rol es un paquete de permisos. Cada usuario tiene uno, y su sucursal decide hasta dónde
          alcanza. Un rol de sucursal solo se asigna a cuentas de esa sucursal.
        </p>
        <Link href="/settings/roles/new" className={linkButton('primary')}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Crear rol
        </Link>
      </div>

      <section aria-labelledby="roles-propios" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="roles-propios" className="text-base font-bold text-slate-900">
            Roles de la empresa
          </h2>
          <span className="text-sm text-slate-500">se crean y editan acá</span>
        </div>
        {data.propios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Todavía no hay roles propios. Creá uno desde cero o duplicá uno del sistema para
            ajustarlo.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.propios.map((r) => (
              <RoleCard key={r.id} role={r} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="roles-sistema" className="space-y-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 id="roles-sistema" className="text-base font-bold text-slate-900">
              Roles del sistema
            </h2>
            <span className="text-sm text-slate-500">compartidos con las demás empresas</span>
          </div>
          <p className="mt-1 max-w-prose text-sm text-slate-600">
            No se editan para todos: un cambio acá le cambiaría los permisos a la gente de otras
            empresas. Para cambiar sus permisos en una sucursal, abrilo y usá «Personalizar para
            esta sucursal»; para partir de uno, duplicalo.
          </p>
        </div>
        <ul className="space-y-3">
          {data.sistema.map((r) => (
            <RoleCard key={r.id} role={r} />
          ))}
        </ul>
      </section>
    </div>
  )
}
