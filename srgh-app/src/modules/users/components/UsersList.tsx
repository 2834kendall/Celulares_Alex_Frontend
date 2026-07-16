'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KeyRound, Loader2, Pencil, Search, Send, UserCheck, UserPlus, UserX } from 'lucide-react'
import type { CatalogoItem } from '@/modules/employees/types'
import type { EmpleadoSinUsuario, UsuarioEstado, UsuarioListItem } from '@/modules/users/types'
import { resendInvitation } from '@/modules/users/actions/resendInvitation'
import { setUserActive } from '@/modules/users/actions/setUserActive'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmployeesWithoutUserBanner } from './EmployeesWithoutUserBanner'
import { InviteUserForm } from './InviteUserForm'
import { EditUserDialog } from './EditUserDialog'

const SELECT_CLASSES =
  'rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10'

const ESTADO_BADGES: Record<UsuarioEstado, { label: string; classes: string }> = {
  activo: { label: 'Activo', classes: 'bg-emerald-50 text-emerald-700' },
  pendiente: { label: 'Pendiente', classes: 'bg-amber-50 text-amber-700' },
  desactivado: { label: 'Desactivado', classes: 'bg-rose-50 text-rose-700' },
}

const FECHA_ACCESO = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type EstadoFiltro = 'todos' | UsuarioEstado

interface UsersListProps {
  usuarios: UsuarioListItem[]
  roles: CatalogoItem[]
  sucursales: CatalogoItem[]
  empleadosSinUsuario: EmpleadoSinUsuario[]
}

type InviteState = { open: false } | { open: true; prefill?: EmpleadoSinUsuario }

/** Panel del tab Usuarios: banner de empleados sin cuenta + lista con acciones. */
export function UsersList({ usuarios, roles, sucursales, empleadosSinUsuario }: UsersListProps) {
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [invite, setInvite] = useState<InviteState>({ open: false })
  const [editing, setEditing] = useState<UsuarioListItem | null>(null)
  const [confirming, setConfirming] = useState<UsuarioListItem | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return usuarios.filter((usuario) => {
      if (estado !== 'todos' && usuario.estado !== estado) return false
      if (!term) return true
      return (
        usuario.email.toLowerCase().includes(term) ||
        (usuario.empleado_nombre ?? '').toLowerCase().includes(term)
      )
    })
  }, [usuarios, search, estado])

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    filtered,
    6
  )

  async function handleResend(usuario: UsuarioListItem) {
    setPendingId(usuario.usr_id)
    const result = await resendInvitation(usuario.usr_id)
    setPendingId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Invitación reenviada a ${usuario.email}.`)
  }

  async function handleToggleActive(usuario: UsuarioListItem) {
    const activar = usuario.estado === 'desactivado'
    setConfirming(null)
    setPendingId(usuario.usr_id)
    const result = await setUserActive(usuario.usr_id, activar)
    setPendingId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(activar ? 'Acceso reactivado.' : 'Acceso desactivado.')
  }

  return (
    <div className="space-y-4">
      <EmployeesWithoutUserBanner
        empleados={empleadosSinUsuario}
        onInvite={(empleado) => setInvite({ open: true, prefill: empleado })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Buscar usuario</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email o empleado…"
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filtrar por estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoFiltro)}
            className={SELECT_CLASSES}
          >
            <option value="todos">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="pendiente">Pendientes</option>
            <option value="desactivado">Desactivados</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setInvite({ open: true })}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <UserPlus className="h-3.5 w-3.5" /> Invitar usuario
        </button>
      </div>

      {usuarios.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Todavía no hay usuarios</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Invita al primer usuario para darle acceso al sistema.
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Sin resultados</p>
          <p className="max-w-sm text-xs text-slate-500">
            Ningún usuario coincide con la búsqueda o el filtro seleccionado.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Usuario</th>
                  <th className="px-3 py-2 text-left font-semibold">Empleado</th>
                  <th className="px-3 py-2 text-left font-semibold">Rol</th>
                  <th className="px-3 py-2 text-left font-semibold">Sucursal</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado</th>
                  <th className="px-3 py-2 text-left font-semibold">Último acceso</th>
                  <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((usuario) => {
                  const badge = ESTADO_BADGES[usuario.estado]
                  const pending = pendingId === usuario.usr_id
                  const desactivado = usuario.estado === 'desactivado'

                  return (
                    <tr
                      key={usuario.usr_id}
                      className="border-t border-slate-100 transition hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">{usuario.email}</td>
                      <td className="px-3 py-2 text-slate-600">{usuario.empleado_nombre ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{usuario.rol_nombre}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {usuario.sucursal_nombre ?? 'Todas'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.classes}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">
                        {usuario.ultimo_acceso
                          ? FECHA_ACCESO.format(new Date(usuario.ultimo_acceso))
                          : 'Nunca'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {pending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditing(usuario)}
                                aria-label={`Editar a ${usuario.email}`}
                                title="Editar rol y vínculo"
                                className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {usuario.estado === 'pendiente' && (
                                <button
                                  type="button"
                                  onClick={() => handleResend(usuario)}
                                  aria-label={`Reenviar invitación a ${usuario.email}`}
                                  title="Reenviar invitación"
                                  className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  desactivado ? handleToggleActive(usuario) : setConfirming(usuario)
                                }
                                aria-label={
                                  desactivado
                                    ? `Reactivar a ${usuario.email}`
                                    : `Desactivar a ${usuario.email}`
                                }
                                title={desactivado ? 'Reactivar acceso' : 'Desactivar acceso'}
                                className={`rounded-full p-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                                  desactivado
                                    ? 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                                    : 'text-slate-500 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                              >
                                {desactivado ? (
                                  <UserCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <UserX className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}

      {invite.open && (
        <InviteUserForm
          roles={roles}
          sucursales={sucursales}
          empleadosSinUsuario={empleadosSinUsuario}
          prefill={invite.prefill}
          onClose={() => setInvite({ open: false })}
        />
      )}

      {editing && (
        <EditUserDialog
          usuario={editing}
          roles={roles}
          sucursales={sucursales}
          empleadosSinUsuario={empleadosSinUsuario}
          onClose={() => setEditing(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Desactivar acceso"
          message={`${confirming.email} no podrá iniciar sesión hasta que se reactive. Su información y su historial se conservan.`}
          confirmLabel="Desactivar"
          onCancel={() => setConfirming(null)}
          onConfirm={() => handleToggleActive(confirming)}
        />
      )}
    </div>
  )
}
