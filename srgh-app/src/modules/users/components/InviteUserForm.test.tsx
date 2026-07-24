import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteUserForm } from './InviteUserForm'
import { inviteUser } from '@/modules/users/actions/inviteUser'

vi.mock('@/modules/users/actions/inviteUser', () => ({ inviteUser: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockInviteUser = vi.mocked(inviteUser)

const EMPLEADOS = [
  {
    emp_id: 11,
    nombre_completo: 'Luis Rojas',
    email_personal: 'luis.rojas@mail.com',
    puesto_nombre: 'Cajero',
  },
  { emp_id: 12, nombre_completo: 'Zoe Vega', email_personal: null, puesto_nombre: null },
]

function renderForm(props: Partial<Parameters<typeof InviteUserForm>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <InviteUserForm
      roles={[{ id: 4, nombre: 'Empleado' }]}
      sucursales={[{ id: 2, nombre: 'Central' }]}
      empleadosSinUsuario={EMPLEADOS}
      onClose={onClose}
      {...props}
    />
  )
  return { onClose }
}

describe('<InviteUserForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('valida email y rol antes de enviar', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }))

    expect(await screen.findByText('Correo electrónico inválido')).toBeVisible()
    expect(mockInviteUser).not.toHaveBeenCalled()
  })

  it('sugiere el email personal al elegir un empleado', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Empleado vinculado (opcional)'), '11')

    expect(screen.getByLabelText('Email de acceso *')).toHaveValue('luis.rojas@mail.com')
  })

  it('no pisa un email ya escrito al cambiar de empleado', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Email de acceso *'), 'otro@empresa.com')
    await user.selectOptions(screen.getByLabelText('Empleado vinculado (opcional)'), '11')

    expect(screen.getByLabelText('Email de acceso *')).toHaveValue('otro@empresa.com')
  })

  it('envía la invitación y cierra el modal', async () => {
    mockInviteUser.mockResolvedValue({ ok: true, usrId: 7 })
    const user = userEvent.setup()
    const { onClose } = renderForm()

    await user.selectOptions(screen.getByLabelText('Empleado vinculado (opcional)'), '11')
    await user.selectOptions(screen.getByLabelText('Rol *'), '4')
    await user.selectOptions(screen.getByLabelText('Sucursal (opcional)'), '2')
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }))

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalledWith({
        email: 'luis.rojas@mail.com',
        rol_id: 4,
        sucursal_id: 2,
        empleado_id: 11,
      })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('precarga empleado y email desde el banner', () => {
    renderForm({ prefill: EMPLEADOS[0] })

    expect(screen.getByLabelText('Empleado vinculado (opcional)')).toHaveValue('11')
    expect(screen.getByLabelText('Email de acceso *')).toHaveValue('luis.rojas@mail.com')
  })

  it('muestra el error del servidor sin cerrar', async () => {
    mockInviteUser.mockResolvedValue({
      ok: false,
      error: 'Ese correo ya tiene un usuario en el sistema.',
    })
    const user = userEvent.setup()
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Email de acceso *'), 'ana@empresa.com')
    await user.selectOptions(screen.getByLabelText('Rol *'), '4')
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese correo ya tiene un usuario en el sistema.'
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
