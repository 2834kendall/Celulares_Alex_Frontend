import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeForm } from './EmployeeForm'
import { updateEmployee } from '@/modules/employees/actions/updateEmployee'
import { EMPLEADO_DETALLE, TIPOS_IDENTIFICACION } from './testFixtures'

vi.mock('@/modules/employees/actions/updateEmployee', () => ({
  updateEmployee: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockUpdateEmployee = vi.mocked(updateEmployee)

describe('<EmployeeForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('precarga los datos del empleado', () => {
    render(<EmployeeForm empleado={EMPLEADO_DETALLE} tiposIdentificacion={TIPOS_IDENTIFICACION} />)

    expect(screen.getByLabelText('Nombre *')).toHaveValue('Ana')
    expect(screen.getByLabelText('Primer apellido *')).toHaveValue('Mora')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('8888-8888')
    expect(screen.getByLabelText('Tipo de cuenta')).toHaveValue('AHORRO')
  })

  it('bloquea el submit con datos inválidos sin llamar la action', async () => {
    const user = userEvent.setup()
    render(<EmployeeForm empleado={EMPLEADO_DETALLE} tiposIdentificacion={TIPOS_IDENTIFICACION} />)

    await user.clear(screen.getByLabelText('Nombre *'))
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText('El nombre debe tener al menos 2 caracteres')).toBeVisible()
    expect(mockUpdateEmployee).not.toHaveBeenCalled()
  })

  it('envía los cambios y llama onSuccess', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: true })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        onSuccess={onSuccess}
      />
    )

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '7777-7777')
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateEmployee).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          empleado: expect.objectContaining({ emp_telefono: '7777-7777', emp_nombre: 'Ana' }),
          datos_pago: expect.objectContaining({ edp_banco: 'BAC', edp_tipo_cuenta: 'AHORRO' }),
        })
      )
    })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('convierte los campos vacíos en null al enviar', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(<EmployeeForm empleado={EMPLEADO_DETALLE} tiposIdentificacion={TIPOS_IDENTIFICACION} />)

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(mockUpdateEmployee).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          empleado: expect.objectContaining({ emp_telefono: null }),
        })
      )
    })
  })

  it('muestra el error del servidor en un banner', async () => {
    mockUpdateEmployee.mockResolvedValue({ ok: false, error: 'No se pudo actualizar.' })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(
      <EmployeeForm
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        onSuccess={onSuccess}
      />
    )

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar.')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
