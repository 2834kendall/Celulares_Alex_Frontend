'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Banknote,
  CalendarClock,
  CalendarDays,
  Check,
  Clock,
  Copy,
  FileText,
  ListChecks,
  Loader2,
  Minus,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useForm } from '@/hooks/useProtectedForm'
import { Alert } from '@/components/ui/Alert'
import { Button, BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { SPINNER } from '@/components/ui/styles'
import { INPUT_CLASSES } from '@/modules/employees/components/EmployeeFields'
import { PERMISOS, type Permiso } from '@/lib/permissions/catalog'
import { ZONAS, zonasVisibles } from '@/lib/permissions/zones'
import { cn } from '@/lib/utils/cn'
import { deleteRole, saveRole } from './actions'
import {
  ASSIGNABLE_PERMISSIONS,
  PERMISSION_GROUPS,
  checkPermission,
  dependentsOf,
  permissionLabel,
  sortPermissions,
  uncheckPermission,
  type PermissionGroupIcon,
} from './permissions'
import { BranchVersions } from './BranchVersions'
import { roleSchema, type RoleInput, type RoleSummary, type RolesSettings } from './types'

const ICONS: Record<PermissionGroupIcon, LucideIcon> = {
  users: Users,
  file: FileText,
  clock: Clock,
  calendar: CalendarDays,
  schedule: CalendarClock,
  money: Banknote,
  check: ListChecks,
  settings: Settings,
}

const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-slate-700'
const CARD = 'rounded-xl border border-slate-200 bg-white p-4 sm:p-5'

/** MI_HORARIO_READ no amplía ninguna policy: cualquiera con ROLES_WRITE puede darlo (igual que la RPC). */
const SIEMPRE_OTORGABLES = new Set<string>([PERMISOS.MI_HORARIO_READ])

interface RoleEditorProps {
  data: RolesSettings
  /** El rol que se edita (o se ve, si es del sistema). Sin él, es uno nuevo. */
  role?: RoleSummary
  /** Al duplicar: el rol del que se parte. */
  base?: RoleSummary
  /** Valores iniciales ya resueltos por la página (nombre de la copia, dependencias completas). */
  initial: RoleInput
}

/**
 * Editor de un rol: identidad, permisos en casillas agrupadas por módulo y, al
 * costado, el menú que vería la persona y a cuántas cuentas afecta.
 *
 * Las casillas mantienen solas las dependencias (marcar «Editar» marca
 * «Ver»; desmarcar «Ver» desmarca lo que depende de él). Es comodidad: la RPC
 * vuelve a validar todo.
 */
export function RoleEditor({ data, role, base, initial }: RoleEditorProps) {
  const router = useRouter()
  const readOnly = role?.sistema === true
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    control,
    guard,
    formState: { errors, isSubmitting },
  } = useForm<RoleInput>({
    unsavedLabel: 'el rol',
    unsavedEnabled: !readOnly,
    unsavedBusy: deleting,
    resolver: zodResolver(roleSchema),
    defaultValues: initial,
  })

  const permisos = useWatch({ control, name: 'permisos' }) ?? []
  const sucursalId = useWatch({ control, name: 'sucursalId' })
  const selected = new Set(permisos)

  const actorPerms = new Set(data.actorPermisos)
  const esRolPropio = role !== undefined && role.id === data.actorRolId
  const sucursalesOpciones = data.sucursales.filter((s) => s.activa || s.id === role?.sucursalId)

  /** Por qué una casilla no se puede tocar (null = se puede). */
  function lockReason(code: Permiso): string | null {
    if (readOnly) return 'Rol del sistema'
    if (esRolPropio && code === PERMISOS.ROLES_WRITE && selected.has(code))
      return 'Es tu propio rol: no podés quitártelo'
    if (!selected.has(code) && !SIEMPRE_OTORGABLES.has(code) && !actorPerms.has(code))
      return 'Tu rol no tiene este permiso'
    return null
  }

  function setPermisos(next: string[]) {
    setValue('permisos', sortPermissions(next), { shouldDirty: true })
  }

  function toggle(code: Permiso, checked: boolean) {
    setError(null)
    if (checked) {
      setPermisos(checkPermission(permisos, code))
      return
    }
    let next = uncheckPermission(permisos, code)
    // Desmarcar «Ver empleados» en el propio rol no puede arrastrar ROLES_WRITE
    // (no depende de nada, pero se protege igual por si cambia el mapa).
    if (esRolPropio && selected.has(PERMISOS.ROLES_WRITE))
      next = checkPermission(next, PERMISOS.ROLES_WRITE)
    setPermisos(next)
  }

  function clearAll() {
    setError(null)
    setPermisos(esRolPropio && selected.has(PERMISOS.ROLES_WRITE) ? [PERMISOS.ROLES_WRITE] : [])
  }

  async function onSubmit(values: RoleInput) {
    setError(null)
    try {
      const r = await saveRole(role?.id ?? null, values)
      if (!r.ok) {
        setError(r.error)
        return
      }
      guard.acceptChanges()
      toast.success(role ? 'Rol actualizado.' : 'Rol creado.')
      router.push(role ? '/settings/roles' : `/settings/roles/${r.data}`)
      router.refresh()
    } catch {
      setError('No se pudo confirmar el guardado. Revisá la conexión y reintentá.')
    }
  }

  async function onDelete() {
    if (!role) return
    setConfirmDelete(false)
    setDeleting(true)
    setError(null)
    try {
      const r = await deleteRole(role.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      guard.acceptChanges()
      toast.success('Rol eliminado.')
      router.push('/settings/roles')
      router.refresh()
    } catch {
      setError('No se pudo confirmar la eliminación. Revisá la conexión y reintentá.')
    } finally {
      setDeleting(false)
    }
  }

  const visibles = new Set(zonasVisibles(permisos).map((z) => z.key))
  const marcados = permisos.filter((p) => ASSIGNABLE_PERMISSIONS.includes(p as Permiso)).length
  const busy = isSubmitting || deleting

  const title = role ? role.nombre : base ? `Copia de ${base.nombre}` : 'Nuevo rol'
  const esVersion = role?.baseId != null
  const canDelete = role !== undefined && (role.usuarios === 0 || esVersion)
  const description = readOnly
    ? 'Rol del sistema: no se edita para todas las sucursales. Personalizalo para una sucursal (abajo) o duplicalo.'
    : esVersion
      ? `Versión de «${role?.baseNombre ?? 'otro rol'}» solo para ${role?.sucursalNombre ?? 'una sucursal'}: sus cambios no afectan a las demás tiendas.`
      : 'Marcá los permisos del rol. Al marcar «Editar» o «Aprobar» se marca «Ver» solo; al desmarcar «Ver», se desmarca lo que depende de él.'

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        backHref="/settings/roles"
        backLabel="Volver a roles y permisos"
        actions={
          readOnly && role ? (
            <Link
              href={`/settings/roles/new?desde=${role.id}`}
              className={cn(BUTTON_BASE, BUTTON_VARIANTS.secondary, BUTTON_SIZES.lg, 'min-h-11')}
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              Duplicar
            </Link>
          ) : undefined
        }
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-wrap items-start gap-6"
      >
        <div className="flex min-w-0 grow-[999] basis-[560px] flex-col gap-5">
          <section aria-labelledby="rol-identidad" className={CARD}>
            <h2 id="rol-identidad" className="mb-4 text-base font-bold text-slate-900">
              Identidad del rol
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rol-nombre" className={FIELD_LABEL}>
                  Nombre
                </label>
                <input
                  id="rol-nombre"
                  {...register('nombre')}
                  readOnly={readOnly}
                  aria-invalid={errors.nombre ? true : undefined}
                  aria-describedby={errors.nombre ? 'rol-nombre-error' : undefined}
                  className={cn(INPUT_CLASSES, 'min-h-11')}
                  maxLength={60}
                />
                {errors.nombre && (
                  <p id="rol-nombre-error" className="mt-1 text-xs text-rose-700">
                    {errors.nombre.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="rol-descripcion" className={FIELD_LABEL}>
                  Descripción <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="rol-descripcion"
                  {...register('descripcion')}
                  readOnly={readOnly}
                  aria-invalid={errors.descripcion ? true : undefined}
                  className={cn(INPUT_CLASSES, 'min-h-11')}
                  maxLength={200}
                />
                {errors.descripcion && (
                  <p className="mt-1 text-xs text-rose-700">{errors.descripcion.message}</p>
                )}
              </div>
              {!readOnly && (
                <div className="sm:col-span-2">
                  <label htmlFor="rol-sucursal" className={FIELD_LABEL}>
                    Sucursal
                  </label>
                  <select
                    id="rol-sucursal"
                    className={cn(INPUT_CLASSES, 'min-h-11 sm:max-w-sm')}
                    value={
                      sucursalId === null || sucursalId === undefined ? '' : String(sucursalId)
                    }
                    onChange={(e) =>
                      setValue('sucursalId', e.target.value ? Number(e.target.value) : null, {
                        shouldDirty: true,
                      })
                    }
                    aria-describedby="rol-sucursal-ayuda"
                  >
                    <option value="">Toda la empresa</option>
                    {sucursalesOpciones.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.activa ? s.nombre : `${s.nombre} (inactiva)`}
                      </option>
                    ))}
                  </select>
                  <p id="rol-sucursal-ayuda" className="mt-1 text-xs text-slate-500">
                    Un rol de sucursal solo se asigna a cuentas de esa sucursal, así que cambiarlo
                    no afecta a las demás tiendas.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="rol-permisos" className={CARD}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="rol-permisos" className="text-base font-bold text-slate-900">
                Permisos
              </h2>
              <span className="text-sm text-slate-500" aria-live="polite">
                {marcados} de {ASSIGNABLE_PERMISSIONS.length} marcados
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="ml-auto min-h-11"
                  onClick={clearAll}
                  disabled={busy || marcados === 0}
                >
                  Desmarcar todo
                </Button>
              )}
            </div>

            {PERMISSION_GROUPS.map((group) => {
              const Icon = ICONS[group.icon]
              const count = group.items.filter((i) => selected.has(i.code)).length
              return (
                <fieldset key={group.id} className="mt-4 border-t border-slate-200 pt-4">
                  <legend className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
                    <Icon aria-hidden="true" className="h-4 w-4 text-brand-700" />
                    {group.label}
                    <span className="font-normal text-slate-500">
                      {count}/{group.items.length}
                    </span>
                  </legend>
                  <div className="mt-2 grid gap-x-5 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const reason = lockReason(item.code)
                      const deps = selected.has(item.code) ? dependentsOf(item.code) : []
                      const arrastra = deps.filter((d) => selected.has(d))
                      const hintId = `perm-${item.code}-hint`
                      const hint =
                        reason && !readOnly
                          ? reason
                          : arrastra.length > 0
                            ? `Desmarcarlo quita también: ${arrastra.map(permissionLabel).join(', ')}`
                            : null
                      return (
                        <label
                          key={item.code}
                          className={cn(
                            'flex min-h-11 items-start gap-3 py-2.5 text-sm text-slate-900',
                            reason ? 'cursor-not-allowed' : 'cursor-pointer'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.code)}
                            disabled={Boolean(reason) || busy}
                            onChange={(e) => toggle(item.code, e.target.checked)}
                            aria-describedby={hint ? hintId : undefined}
                            className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500/40 disabled:opacity-60"
                          />
                          <span>
                            <span className={reason && !readOnly ? 'text-slate-500' : undefined}>
                              {item.label}
                            </span>
                            {hint && (
                              <span id={hintId} className="block text-xs text-slate-500">
                                {hint}
                              </span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })}
          </section>

          {error && <Alert tone="error">{error}</Alert>}
          {role && !readOnly && !canDelete && (
            <p className="text-xs text-slate-500">
              Para eliminar este rol, primero asigná otro rol a sus {role.usuarios}{' '}
              {role.usuarios === 1 ? 'usuario' : 'usuarios'} desde Usuarios.
            </p>
          )}

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" className="min-h-11" disabled={busy}>
                {isSubmitting ? (
                  <>
                    <Loader2 aria-hidden="true" className={SPINNER} /> Guardando
                  </>
                ) : role ? (
                  'Guardar cambios'
                ) : (
                  'Crear rol'
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="min-h-11"
                disabled={busy}
                onClick={() => guard.confirmLeave(() => router.push('/settings/roles'))}
              >
                Cancelar
              </Button>
              {role && (
                <Button
                  type="button"
                  variant="danger"
                  size="lg"
                  className="min-h-11 sm:ml-auto"
                  disabled={busy || !canDelete}
                  title={
                    canDelete
                      ? undefined
                      : 'Tiene usuarios activos: asignales otro rol antes de eliminarlo.'
                  }
                  onClick={() => setConfirmDelete(true)}
                >
                  {deleting ? (
                    <>
                      <Loader2 aria-hidden="true" className={SPINNER} /> Eliminando
                    </>
                  ) : (
                    'Eliminar rol'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="flex min-w-[272px] max-w-[340px] grow basis-[300px] flex-col gap-4">
          <section aria-labelledby="rol-menu" className={CARD}>
            <h2 id="rol-menu" className="text-sm font-bold text-slate-900">
              Lo que vería esta persona
            </h2>
            <p className="mb-3 text-xs text-slate-500">Menú lateral de la aplicación</p>
            <ul className="flex flex-col gap-0.5">
              {ZONAS.map((zona) => {
                const visible = visibles.has(zona.key)
                return (
                  <li
                    key={zona.key}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm',
                      visible ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-500'
                    )}
                  >
                    {visible ? (
                      <Check aria-hidden="true" className="h-4 w-4 text-brand-700" />
                    ) : (
                      <Minus aria-hidden="true" className="h-4 w-4 text-slate-400" />
                    )}
                    <span>{zona.label}</span>
                    <span className="sr-only">{visible ? '(visible)' : '(oculto)'}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="rol-afecta" className={CARD}>
            <h2 id="rol-afecta" className="mb-3 text-sm font-bold text-slate-900">
              A quién afecta
            </h2>
            <p className="text-3xl font-bold leading-none text-slate-900">
              {role?.usuarios ?? 0}{' '}
              <span className="text-sm font-medium text-slate-500">
                {(role?.usuarios ?? 0) === 1 ? 'usuario' : 'usuarios'}
              </span>
            </p>
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
              {role
                ? 'Verán el cambio cuando su sesión se renueve, dentro de la próxima hora, o al volver a iniciar sesión.'
                : 'Nadie lo tiene todavía: se asigna desde Usuarios después de crearlo.'}
            </p>
          </section>
        </aside>
      </form>

      {role && role.asignable && role.sucursalId === null && (
        <BranchVersions role={role} data={data} />
      )}

      {confirmDelete && role && (
        <ConfirmDialog
          title={esVersion ? 'Quitar la versión de la sucursal' : 'Eliminar rol'}
          message={
            esVersion && role.usuarios > 0
              ? `¿Eliminar «${role.nombre}»? Sus ${role.usuarios} ${role.usuarios === 1 ? 'usuario vuelve' : 'usuarios vuelven'} a «${role.baseNombre ?? 'el rol original'}» con sus permisos.`
              : `¿Eliminar «${role.nombre}»? Dejará de poder asignarse. Esta acción no se puede deshacer.`
          }
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}
