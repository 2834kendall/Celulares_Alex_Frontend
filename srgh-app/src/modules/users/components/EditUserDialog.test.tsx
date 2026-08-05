import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditUserDialog } from './EditUserDialog'
import { updateUserAssignment } from '@/modules/users/actions/updateUserAssignment'
import type { UsuarioListItem } from '@/modules/users/types'

vi.mock('@/modules/users/actions/updateUserAssignment', () => ({ updateUserAssignment: vi.fn() }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockUpdateUserAssignment = vi.mocked(updateUserAssignment)

const USUARIO: UsuarioListItem = {
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
}

const ROLES = [
  { id: 4, nombre: 'Empleado' },
  { id: 5, nombre: 'RRHH' },
]

function renderDialog(usuario: UsuarioListItem = USUARIO) {
  const onClose = vi.fn()
  render(
    <EditUserDialog
      usuario={usuario}
      roles={ROLES}
      sucursales={[{ id: 2, nombre: 'Central' }]}
      empleadosSinUsuario={[
        { emp_id: 11, nombre_completo: 'Luis Rojas', email_personal: null, puesto_nombre: null },
      ]}
      onClose={onClose}
    />
  )
  return { onClose }
}

describe('<EditUserDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('precarga rol, sucursal y empleado actuales, con el vínculo en las opciones', () => {
    renderDialog()

    expect(screen.getByLabelText('Rol *')).toHaveValue('4')
    expect(screen.getByLabelText('Sucursal (opcional)')).toHaveValue('2')
    // El empleado vinculado no está en la lista "sin usuario": se antepone.
    expect(screen.getByLabelText('Empleado vinculado (opcional)')).toHaveValue('10')
    expect(screen.getByRole('option', { name: 'Ana Mora' })).toBeInTheDocument()
  })

  it('avisa que los cambios aplican en el próximo inicio de sesión', () => {
    renderDialog()

    expect(screen.getByText(/aplican en el\s*próximo inicio de sesión/)).toBeVisible()
  })

  it('guarda los cambios y cierra', async () => {
    mockUpdateUserAssignment.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await user.selectOptions(screen.getByLabelText('Rol *'), '5')
    await user.selectOptions(screen.getByLabelText('Empleado vinculado (opcional)'), '')
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateUserAssignment).toHaveBeenCalledWith(7, {
        rol_id: 5,
        sucursal_id: 2,
        empleado_id: null,
      })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('muestra el error del servidor sin cerrar', async () => {
    mockUpdateUserAssignment.mockResolvedValue({
      ok: false,
      error: 'Ese empleado ya está vinculado a otro usuario.',
    })
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese empleado ya está vinculado a otro usuario.'
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
