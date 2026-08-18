import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsersList } from './UsersList'
import { chooseSelectMenuOption } from '@/test/selectMenu'
import { resendInvitation } from '@/modules/users/actions/resendInvitation'
import { setUserActive } from '@/modules/users/actions/setUserActive'
import type { UsuarioListItem } from '@/modules/users/types'

vi.mock('@/modules/users/actions/resendInvitation', () => ({ resendInvitation: vi.fn() }))
vi.mock('@/modules/users/actions/setUserActive', () => ({ setUserActive: vi.fn() }))
vi.mock('@/modules/users/actions/inviteUser', () => ({ inviteUser: vi.fn() }))
vi.mock('@/modules/users/actions/updateUserAssignment', () => ({ updateUserAssignment: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockResendInvitation = vi.mocked(resendInvitation)
const mockSetUserActive = vi.mocked(setUserActive)

const USUARIOS: UsuarioListItem[] = [
  {
    usr_id: 7,
    email: 'ana@empresa.com',
    empleado_id: 10,
    empleado_nombre: 'Ana Mora',
    rol_id: 4,
    rol_nombre: 'Empleado',
    sucursal_id: 2,
    sucursal_nombre: 'Central',
    estado: 'activo',
    ultimo_acceso: '2026-07-01T10:00:00Z',
  },
  {
    usr_id: 8,
    email: 'luis@empresa.com',
    empleado_id: null,
    empleado_nombre: null,
    rol_id: 4,
    rol_nombre: 'Empleado',
    sucursal_id: null,
    sucursal_nombre: null,
    estado: 'pendiente',
    ultimo_acceso: null,
  },
  {
    usr_id: 9,
    email: 'eva@empresa.com',
    empleado_id: null,
    empleado_nombre: null,
    rol_id: 5,
    rol_nombre: 'RRHH',
    sucursal_id: null,
    sucursal_nombre: null,
    estado: 'desactivado',
    ultimo_acceso: '2026-06-01T10:00:00Z',
  },
]

const EMPLEADOS_SIN_USUARIO = [
  {
    emp_id: 11,
    nombre_completo: 'Luis Rojas',
    email_personal: 'luis.rojas@mail.com',
    puesto_nombre: 'Cajero',
  },
]

function renderList(usuarios: UsuarioListItem[] = USUARIOS) {
  return render(
    <UsersList
      usuarios={usuarios}
      roles={[{ id: 4, nombre: 'Empleado' }]}
      sucursales={[{ id: 2, nombre: 'Central' }]}
      empleadosSinUsuario={EMPLEADOS_SIN_USUARIO}
    />
  )
}

/**
 * El componente rinde la MISMA data dos veces: tarjetas en movil y tabla
 * desde el ancho de contenedor 3xl. En un navegador solo una existe (la otra
 * es display:none), pero jsdom no aplica CSS y ve las dos. Se consulta dentro
 * de la tabla en vez de relajar los tests a getAllBy*.
 */
function tabla() {
  return within(screen.getByRole('table'))
}

function tarjetas() {
  return within(screen.getByRole('list'))
}

/** Cobertura de la rama movil: misma data, sin encabezados de columna. */
function esperarTarjetaCompleta(email: string) {
  const tarjeta = tarjetas()
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(email))!

  expect(tarjeta).toBeDefined()

  // Se leen los <dt> y no se busca por texto: "Empleado" es tambien el nombre
  // de un rol, asi que una consulta por texto encuentra la etiqueta Y el valor.
  const etiquetas = [...tarjeta.querySelectorAll('dt')].map((dt) => dt.textContent)
  expect(etiquetas).toEqual(['Empleado', 'Rol', 'Sucursal', 'Último acceso'])

  return tarjeta
}

describe('<UsersList />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra los usuarios con su estado y último acceso', () => {
    renderList()

    expect(tabla().getByText('ana@empresa.com')).toBeInTheDocument()
    expect(tabla().getByText('Ana Mora')).toBeInTheDocument()
    expect(tabla().getByText('Activo')).toBeInTheDocument()
    expect(tabla().getByText('Pendiente')).toBeInTheDocument()
    expect(tabla().getByText('Desactivado')).toBeInTheDocument()
    // El pendiente nunca ha entrado.
    expect(tabla().getByText('Nunca')).toBeInTheDocument()
  })

  it('filtra por búsqueda y por estado', async () => {
    const user = userEvent.setup()
    renderList()

    await user.type(screen.getByLabelText('Buscar usuario'), 'ana')
    expect(tabla().getByText('ana@empresa.com')).toBeInTheDocument()
    expect(tabla().queryByText('luis@empresa.com')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Buscar usuario'))
    await chooseSelectMenuOption(user, 'Filtrar por estado', 'Pendientes')
    expect(tabla().getByText('luis@empresa.com')).toBeInTheDocument()
    expect(tabla().queryByText('ana@empresa.com')).not.toBeInTheDocument()
  })

  it('solo ofrece reenviar invitación a los pendientes', () => {
    renderList()

    expect(
      tabla().getByRole('button', { name: 'Reenviar invitación a luis@empresa.com' })
    ).toBeInTheDocument()
    expect(
      tabla().queryByRole('button', { name: 'Reenviar invitación a ana@empresa.com' })
    ).not.toBeInTheDocument()
  })

  it('reenvía la invitación de un pendiente', async () => {
    mockResendInvitation.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderList()

    await user.click(
      tabla().getByRole('button', { name: 'Reenviar invitación a luis@empresa.com' })
    )

    await waitFor(() => {
      expect(mockResendInvitation).toHaveBeenCalledWith(8)
    })
  })

  it('desactivar pide confirmación antes de llamar la action', async () => {
    mockSetUserActive.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderList()

    await user.click(tabla().getByRole('button', { name: 'Desactivar a ana@empresa.com' }))

    // Aún no se llama: primero el diálogo de confirmación.
    expect(mockSetUserActive).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/ana@empresa\.com no podrá iniciar sesión/)).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => {
      expect(mockSetUserActive).toHaveBeenCalledWith(7, false)
    })
  })

  it('reactivar no pide confirmación', async () => {
    mockSetUserActive.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderList()

    await user.click(tabla().getByRole('button', { name: 'Reactivar a eva@empresa.com' }))

    await waitFor(() => {
      expect(mockSetUserActive).toHaveBeenCalledWith(9, true)
    })
  })

  it('abre el diálogo de edición con los datos del usuario', async () => {
    const user = userEvent.setup()
    renderList()

    await user.click(tabla().getByRole('button', { name: 'Editar a ana@empresa.com' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Editar usuario')).toBeInTheDocument()
    expect(within(dialog).getByText('ana@empresa.com')).toBeInTheDocument()
  })

  it('el banner de empleados sin usuario abre la invitación precargada', async () => {
    const user = userEvent.setup()
    renderList()

    await user.click(screen.getByRole('button', { name: /1 empleado activo sin cuenta/ }))
    await user.click(screen.getByRole('button', { name: /Crear usuario/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Invitar usuario')).toBeInTheDocument()
    // Email personal del empleado sugerido y empleado preseleccionado.
    expect(within(dialog).getByLabelText('Email de acceso *')).toHaveValue('luis.rojas@mail.com')
    expect(within(dialog).getByLabelText('Empleado vinculado (opcional)')).toHaveTextContent(
      'Luis Rojas'
    )
  })

  it('en movil rinde cada usuario como tarjeta, con sus datos rotulados', () => {
    renderList()

    const tarjeta = esperarTarjetaCompleta('ana@empresa.com')

    // Las acciones viven tambien en la tarjeta, no solo en la tabla.
    expect(
      within(tarjeta).getByRole('button', { name: 'Editar a ana@empresa.com' })
    ).toBeInTheDocument()
  })

  it('muestra el vacío cuando no hay usuarios', () => {
    renderList([])

    // Sin usuarios no se rinde ninguna de las dos ramas: se consulta global.
    expect(screen.getByText('Todavía no hay usuarios')).toBeInTheDocument()
  })
})
