'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Store } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SPINNER } from '@/components/ui/styles'
import { INPUT_CLASSES } from '@/modules/employees/components/EmployeeFields'
import { cn } from '@/lib/utils/cn'
import { customizeRoleForBranch } from './actions'
import type { RoleSummary, RolesSettings } from './types'

/**
 * Versiones por sucursal de un rol del sistema (o propio de toda la empresa).
 *
 * «Personalizar» crea la versión de esa sucursal con los mismos permisos y le
 * pasa las cuentas que trabajan solo ahí; después se edita sin tocar a las
 * demás tiendas. Quien trabaja en varias sucursales se queda en el rol base.
 */
export function BranchVersions({ role, data }: { role: RoleSummary; data: RolesSettings }) {
  const router = useRouter()
  const versiones = data.propios.filter((r) => r.baseId === role.id)
  const conVersion = new Set(versiones.map((v) => v.sucursalId))
  const disponibles = data.sucursales.filter((s) => s.activa && !conVersion.has(s.id))
  const [sucursal, setSucursal] = useState<string>(disponibles[0] ? String(disponibles[0].id) : '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function personalizar() {
    if (!sucursal) return
    setPending(true)
    setError(null)
    try {
      const r = await customizeRoleForBranch(role.id, Number(sucursal))
      if (!r.ok) {
        setError(r.error)
        return
      }
      const { movidos, omitidos } = r.data
      toast.success(
        r.data.creado
          ? `Versión creada. ${movidos} ${movidos === 1 ? 'cuenta pasó' : 'cuentas pasaron'} a ella.`
          : 'Esa sucursal ya tenía su versión.'
      )
      if (omitidos > 0)
        toast.info(
          `${omitidos} ${omitidos === 1 ? 'cuenta trabaja' : 'cuentas trabajan'} en varias sucursales y se ${omitidos === 1 ? 'queda' : 'quedan'} con «${role.nombre}».`
        )
      router.push(`/settings/roles/${r.data.id}`)
      router.refresh()
    } catch {
      setError('No se pudo confirmar el cambio. Revisá la conexión y reintentá.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      aria-labelledby="rol-sucursales"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <h2 id="rol-sucursales" className="text-base font-bold text-slate-900">
        Permisos por sucursal
      </h2>
      <p className="mt-1 max-w-prose text-sm text-slate-600">
        Para cambiar los permisos de «{role.nombre}» solo en una sucursal, creá su versión para esa
        sucursal. Arranca con los mismos permisos y las cuentas de esa sucursal pasan a usarla; las
        demás tiendas no cambian.
      </p>

      {versiones.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {versiones.map((v) => (
            <li key={v.id}>
              <Link
                href={`/settings/roles/${v.id}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <Store aria-hidden="true" className="h-4 w-4 text-brand-700" />
                  {v.sucursalNombre ?? 'Sucursal'}
                </span>
                <span className="text-sm text-slate-600">
                  {v.usuarios} {v.usuarios === 1 ? 'usuario' : 'usuarios'} · Editar permisos
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {disponibles.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 grow sm:max-w-xs">
            <label
              htmlFor="rol-personalizar"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Sucursal
            </label>
            <select
              id="rol-personalizar"
              className={cn(INPUT_CLASSES, 'min-h-11')}
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              disabled={pending}
            >
              {disponibles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={personalizar}
            disabled={pending || !sucursal}
          >
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className={SPINNER} /> Creando
              </>
            ) : (
              'Personalizar para esta sucursal'
            )}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Todas las sucursales activas ya tienen su versión de este rol.
        </p>
      )}

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
    </section>
  )
}
