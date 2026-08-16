'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  KeyRound,
  Loader2,
  Pencil,
  Search,
  SearchX,
  Send,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
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
import { Button } from '@/components/ui/Button'
import { ICON_CONTROL_BASE, IconButton } from '@/components/ui/IconButton'
import {
  META_LABEL,
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_NUM,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'

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

  /** Estado del acceso. Lo rinden las dos vistas: tarjetas y tabla. */
  function EstadoBadge({ estado }: { estado: UsuarioEstado }) {
    const badge = ESTADO_BADGES[estado]
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.classes}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {badge.label}
      </span>
    )
  }

  /**
   * Editar, reenviar invitacion y activar/desactivar. Vive dentro del
   * componente porque necesita los handlers y el estado local; extraerlo
   * afuera obligaria a pasar cinco props solo para evitar duplicarlo.
   */
  function Acciones({ usuario, pending }: { usuario: UsuarioListItem; pending: boolean }) {
    const desactivado = usuario.estado === 'desactivado'

    if (pending) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
    }

    return (
      <>
        <IconButton
          onClick={() => setEditing(usuario)}
          aria-label={`Editar a ${usuario.email}`}
          title="Editar rol y vínculo"
        >
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
        {usuario.estado === 'pendiente' && (
          <IconButton
            onClick={() => handleResend(usuario)}
            aria-label={`Reenviar invitación a ${usuario.email}`}
            title="Reenviar invitación"
            tone="blue"
          >
            <Send className="h-3.5 w-3.5" />
          </IconButton>
        )}
        <button
          type="button"
          onClick={() => (desactivado ? handleToggleActive(usuario) : setConfirming(usuario))}
          aria-label={
            desactivado ? `Reactivar a ${usuario.email}` : `Desactivar a ${usuario.email}`
          }
          title={desactivado ? 'Reactivar acceso' : 'Desactivar acceso'}
          // El token base aporta forma, area tocable y foco; el color va
          // aparte porque reactivar es verde y no existe ese tono en IconButton.
          className={cn(
            ICON_CONTROL_BASE,
            'focus-visible:ring-blue-500/60',
            desactivado
              ? 'hover:bg-emerald-50 hover:text-emerald-700'
              : 'hover:bg-rose-50 hover:text-rose-700'
          )}
        >
          {desactivado ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
        </button>
      </>
    )
  }

  return (
    <div className="@container space-y-4">
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
        <Button onClick={() => setInvite({ open: true })}>
          <UserPlus className="h-3.5 w-3.5" /> Invitar usuario
        </Button>
      </div>

      {usuarios.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Todavía no hay usuarios"
          description="Invita al primer usuario para darle acceso al sistema."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Sin resultados"
          description="Ningún usuario coincide con la búsqueda o el filtro seleccionado."
        />
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Movil: una tarjeta por usuario. La tabla tiene 7 columnas —y un
            correo largo ya se come el ancho de un telefono— asi que abajo de
            @3xl el scroll horizontal escondia los encabezados.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedItems.map((usuario, index) => (
              <li
                key={usuario.usr_id}
                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                className="animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-slate-800">
                    {usuario.email}
                  </p>
                  <EstadoBadge estado={usuario.estado} />
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    { label: 'Empleado', valor: usuario.empleado_nombre ?? '—' },
                    { label: 'Rol', valor: usuario.rol_nombre },
                    { label: 'Sucursal', valor: usuario.sucursal_nombre ?? 'Todas' },
                    {
                      label: 'Último acceso',
                      valor: usuario.ultimo_acceso
                        ? FECHA_ACCESO.format(new Date(usuario.ultimo_acceso))
                        : 'Nunca',
                    },
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 break-words text-xs text-slate-600">{valor}</dd>
                    </div>
                  ))}
                </dl>

                {/*
                  gap-2 y no gap-1: con el area tocable en 44px, tres botones
                  con gap-1 quedan practicamente pegados y se toca el vecino.
                */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <Acciones usuario={usuario} pending={pendingId === usuario.usr_id} />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden @3xl:block @3xl:overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Usuario</th>
                  <th className={TABLE_TH}>Empleado</th>
                  <th className={TABLE_TH}>Rol</th>
                  <th className={TABLE_TH}>Sucursal</th>
                  <th className={TABLE_TH}>Estado</th>
                  <th className={TABLE_TH}>Último acceso</th>
                  <th className={TABLE_TH_RIGHT}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((usuario) => {
                  const pending = pendingId === usuario.usr_id

                  return (
                    <tr key={usuario.usr_id} className={TABLE_ROW}>
                      <td className={TABLE_TD_STRONG}>{usuario.email}</td>
                      <td className={TABLE_TD}>{usuario.empleado_nombre ?? '—'}</td>
                      <td className={TABLE_TD}>{usuario.rol_nombre}</td>
                      <td className={TABLE_TD}>{usuario.sucursal_nombre ?? 'Todas'}</td>
                      <td className="px-3 py-2">
                        <EstadoBadge estado={usuario.estado} />
                      </td>
                      <td className={TABLE_TD_NUM}>
                        {usuario.ultimo_acceso
                          ? FECHA_ACCESO.format(new Date(usuario.ultimo_acceso))
                          : 'Nunca'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Acciones usuario={usuario} pending={pending} />
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
