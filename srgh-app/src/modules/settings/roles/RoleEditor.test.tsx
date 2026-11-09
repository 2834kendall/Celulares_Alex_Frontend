import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChangesProvider'
import { RoleEditor } from './RoleEditor'
import { customizeRoleForBranch, deleteRole, saveRole } from './actions'
import type { RoleInput, RoleSummary, RolesSettings } from './types'

vi.mock('./actions', () => ({
  saveRole: vi.fn(),
  deleteRole: vi.fn(),
  customizeRoleForBranch: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: vi.fn(),
}))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const TODOS = [
  'EMPLEADOS_READ',
  'EMPLEADOS_WRITE',
  'FOTOS_READ',
  'DOCUMENTOS_READ',
  'DOCUMENTOS_WRITE',
  'BIOMETRIA_WRITE',
  'HISTORIAL_READ',
  'HISTORIAL_WRITE',
  'ASISTENCIA_READ',
  'ASISTENCIA_WRITE',
  'AUSENCIAS_READ',
  'AUSENCIAS_WRITE',
  'AUSENCIAS_APPROVE',
  'HORARIOS_READ',
  'HORARIOS_WRITE',
  'NOMINA_READ',
  'NOMINA_WRITE',
  'NOMINA_APPROVE',
  'COMPROBANTES_READ',
  'RECLUTAMIENTO_READ',
  'RECLUTAMIENTO_WRITE',
  'EVALUACIONES_READ',
  'EVALUACIONES_WRITE',
  'CATALOGOS_WRITE',
  'EMPRESAS_WRITE',
  'USUARIOS_WRITE',
  'ROLES_WRITE',
  'REPORTES_READ',
]

const supervisor: RoleSummary = {
  id: 40,
  nombre: 'Supervisor de Tienda',
  descripcion: 'Encargado de piso',
  sistema: false,
  asignable: true,
  sucursalId: 10,
  sucursalNombre: 'Tienda Infinity',
  baseId: null,
  baseNombre: null,
  permisos: ['EMPLEADOS_READ', 'HORARIOS_READ'],
  usuarios: 4,
}

function data(over: Partial<RolesSettings> = {}): RolesSettings {
  return {
    propios: [supervisor],
    sistema: [],
    sucursales: [
      { id: 10, nombre: 'Tienda Infinity', activa: true },
      { id: 11, nombre: 'Celulares Alex', activa: true },
    ],
    actorRolId: 1,
    actorPermisos: TODOS,
    ...over,
  }
}

const inicial = (role: RoleSummary): RoleInput => ({
  nombre: role.nombre,
  descripcion: role.descripcion ?? '',
  sucursalId: role.sucursalId,
  permisos: role.permisos,
})

function setup(props: Partial<React.ComponentProps<typeof RoleEditor>> = {}) {
  const role = props.role === undefined ? supervisor : props.role
  return render(
    <UnsavedChangesProvider>
      <RoleEditor
        data={props.data ?? data()}
        role={role}
        initial={
          props.initial ??
          (role ? inicial(role) : { nombre: '', descripcion: '', sucursalId: null, permisos: [] })
        }
      />
    </UnsavedChangesProvider>
  )
}

const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) })

beforeEach(() => vi.clearAllMocks())

describe('RoleEditor', () => {
  it('marcar «Editar empleados» deja marcado «Ver empleados»', async () => {
    setup({ initial: { ...inicial(supervisor), permisos: [] } })
    await userEvent.click(box('Editar empleados'))
    expect(box('Ver empleados')).toBeChecked()
    expect(box('Editar empleados')).toBeChecked()
  })

  it('desmarcar «Ver empleados» desmarca lo que depende de él', async () => {
    setup({ initial: { ...inicial(supervisor), permisos: ['EMPLEADOS_READ', 'FOTOS_READ'] } })
    await userEvent.click(box('Ver empleados'))
    expect(box('Ver fotos de empleados')).not.toBeChecked()
  })

  it('el menú de la derecha refleja los permisos marcados', async () => {
    setup()
    const menu = screen.getByRole('region', { name: 'Lo que vería esta persona' })
    expect(within(menu).getByText('Horarios').parentElement).toHaveTextContent('(visible)')
    expect(within(menu).getByText('Nómina').parentElement).toHaveTextContent('(oculto)')
    await userEvent.click(box('Ver nómina'))
    expect(within(menu).getByText('Nómina').parentElement).toHaveTextContent('(visible)')
  })

  it('en el propio rol no deja quitar «Administrar roles y permisos»', () => {
    const propio = { ...supervisor, id: 1, permisos: ['ROLES_WRITE'] }
    setup({ role: propio, data: data({ propios: [propio], actorRolId: 1 }) })
    expect(box('Administrar roles y permisos')).toBeDisabled()
  })

  it('no ofrece otorgar permisos que el propio rol no tiene', () => {
    setup({ data: data({ actorPermisos: ['ROLES_WRITE', 'EMPLEADOS_READ', 'HORARIOS_READ'] }) })
    expect(box('Aprobar nómina')).toBeDisabled()
    expect(screen.getAllByText('Tu rol no tiene este permiso').length).toBeGreaterThan(0)
    // «Ver mi horario» no amplía nada: siempre se puede dar.
    expect(box('Ver mi horario')).toBeEnabled()
  })

  it('guarda con la sucursal elegida y vuelve al listado', async () => {
    vi.mocked(saveRole).mockResolvedValue({ ok: true, data: 40 })
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Sucursal'), 'Celulares Alex')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() =>
      expect(saveRole).toHaveBeenCalledWith(40, {
        nombre: 'Supervisor de Tienda',
        descripcion: 'Encargado de piso',
        sucursalId: 11,
        permisos: ['EMPLEADOS_READ', 'HORARIOS_READ'],
      })
    )
    expect(push).toHaveBeenCalledWith('/settings/roles')
  })

  it('muestra el error de la RPC sin salir de la pantalla', async () => {
    vi.mocked(saveRole).mockResolvedValue({ ok: false, error: 'Ya existe un rol con ese nombre.' })
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Ya existe un rol con ese nombre.')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('no deja eliminar un rol con usuarios activos', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Eliminar rol' })).toBeDisabled()
  })

  it('elimina un rol sin usuarios tras confirmar', async () => {
    vi.mocked(deleteRole).mockResolvedValue({ ok: true, data: 'eliminado' })
    const libre = { ...supervisor, usuarios: 0 }
    setup({ role: libre, data: data({ propios: [libre] }) })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar rol' }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith(40))
    expect(push).toHaveBeenCalledWith('/settings/roles')
  })

  it('un rol del sistema se ve en solo lectura, con opción de duplicarlo', () => {
    const gerente = {
      ...supervisor,
      id: 4,
      nombre: 'Gerente de Sucursal',
      sistema: true,
      sucursalId: null,
    }
    setup({ role: gerente, data: data({ propios: [], sistema: [gerente] }) })
    expect(box('Ver empleados')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Duplicar/ })).toHaveAttribute(
      'href',
      '/settings/roles/new?desde=4'
    )
  })

  it('un rol del sistema se personaliza para una sucursal y abre la versión', async () => {
    vi.mocked(customizeRoleForBranch).mockResolvedValue({
      ok: true,
      data: { id: 77, creado: true, movidos: 2, omitidos: 0 },
    })
    const gerente = {
      ...supervisor,
      id: 4,
      nombre: 'Gerente de Sucursal',
      sistema: true,
      sucursalId: null,
      sucursalNombre: null,
    }
    setup({ role: gerente, data: data({ propios: [], sistema: [gerente] }) })
    const panel = screen.getByRole('region', { name: 'Permisos por sucursal' })
    await userEvent.selectOptions(within(panel).getByLabelText('Sucursal'), 'Celulares Alex')
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Personalizar para esta sucursal' })
    )
    await waitFor(() => expect(customizeRoleForBranch).toHaveBeenCalledWith(4, 11))
    expect(push).toHaveBeenCalledWith('/settings/roles/77')
  })

  it('lista las versiones existentes y no ofrece repetir esa sucursal', () => {
    const gerente = {
      ...supervisor,
      id: 4,
      nombre: 'Gerente de Sucursal',
      sistema: true,
      sucursalId: null,
      sucursalNombre: null,
    }
    const version = { ...supervisor, id: 50, baseId: 4, baseNombre: 'Gerente de Sucursal' }
    setup({ role: gerente, data: data({ propios: [version], sistema: [gerente] }) })
    const panel = screen.getByRole('region', { name: 'Permisos por sucursal' })
    expect(within(panel).getByRole('link', { name: /Tienda Infinity/ })).toHaveAttribute(
      'href',
      '/settings/roles/50'
    )
    const opciones = within(within(panel).getByLabelText('Sucursal')).getAllByRole('option')
    expect(opciones.map((o) => o.textContent)).toEqual(['Celulares Alex'])
  })

  it('una versión de sucursal con usuarios se puede quitar: vuelven al rol base', async () => {
    vi.mocked(deleteRole).mockResolvedValue({ ok: true, data: 'eliminado' })
    const version = { ...supervisor, baseId: 4, baseNombre: 'Gerente de Sucursal' }
    setup({ role: version, data: data({ propios: [version] }) })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar rol' }))
    expect(screen.getByText(/vuelven a «Gerente de Sucursal»/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith(40))
  })
})
