import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeDetail } from './EmployeeDetail'
import { EMPLEADO_DETALLE, TIPOS_IDENTIFICACION } from './testFixtures'

vi.mock('@/modules/employees/actions/updateEmployee', () => ({
  updateEmployee: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

describe('<EmployeeDetail />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra la ficha completa con el contrato vigente', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        canWrite
      />
    )

    expect(screen.getByRole('heading', { name: 'Ana Mora' })).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('Diurna')).toBeInTheDocument()
    expect(screen.getByText('Femenino')).toBeInTheDocument()
    expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
  })

  it('muestra aviso cuando no hay contrato vigente', () => {
    render(
      <EmployeeDetail
        empleado={{ ...EMPLEADO_DETALLE, historial_activo: null }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        canWrite
      />
    )

    expect(screen.getByText('Sin contrato vigente')).toBeInTheDocument()
    expect(screen.getByText(/no tiene un contrato vigente/i)).toBeInTheDocument()
  })

  it('oculta el botón Editar sin canWrite', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        canWrite={false}
      />
    )

    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })

  it('alterna entre modo lectura y edición', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        canWrite
      />
    )

    await user.click(screen.getByRole('button', { name: /editar/i }))

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Ana')

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()
  })
})
