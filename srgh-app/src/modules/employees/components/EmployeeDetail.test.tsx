import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeDetail } from './EmployeeDetail'
import { BANCOS, EMPLEADO_DETALLE, TERRITORIO, TIPOS_IDENTIFICACION } from './testFixtures'

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
        bancos={BANCOS}
        territorio={TERRITORIO}
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
    // El banco se muestra por nombre (join al catálogo), no por id.
    expect(screen.getByText('BAC Credomatic')).toBeInTheDocument()
  })

  it('muestra la dirección resuelta hasta provincia y su código postal', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    // Provincia y cantón no se guardan en la fila: llegan por el join.
    expect(screen.getByText('10201')).toBeInTheDocument()
    expect(screen.getByText('200 m norte de la iglesia')).toBeInTheDocument()
  })

  // La columna ya es NOT NULL, pero el view model admite null por si el join
  // no resuelve la fila; la ficha no debe romperse por eso.
  it('tolera un empleado sin dirección resuelta', () => {
    render(
      <EmployeeDetail
        empleado={{ ...EMPLEADO_DETALLE, direccion: null }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.getByRole('heading', { name: 'Dirección' })).toBeInTheDocument()
    expect(screen.queryByText('200 m norte de la iglesia')).not.toBeInTheDocument()
  })

  it('muestra aviso cuando no hay contrato vigente', () => {
    render(
      <EmployeeDetail
        empleado={{ ...EMPLEADO_DETALLE, historial_activo: null }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
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
        bancos={BANCOS}
        territorio={TERRITORIO}
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
        bancos={BANCOS}
        territorio={TERRITORIO}
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
