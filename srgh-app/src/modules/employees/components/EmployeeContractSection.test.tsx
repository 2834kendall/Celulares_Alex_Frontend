import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EmployeeContractSection, liquidacionHref } from './EmployeeContractSection'
import { HISTORIAL_ACTIVO, HISTORIAL_CERRADO } from './testFixtures'

describe('<EmployeeContractSection />', () => {
  it('muestra el contrato vigente con sus dos salarios', () => {
    render(<EmployeeContractSection contratos={[HISTORIAL_ACTIVO]} canLiquidar={false} />)

    expect(screen.getByText('Cajera')).toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('Indefinido')).toBeInTheDocument()
    expect(screen.getByText('01/02/2024')).toBeInTheDocument()
    expect(screen.getByText('Salario base')).toBeInTheDocument()
    expect(screen.getByText('Salario real')).toBeInTheDocument()
  })

  it('sin contrato vigente muestra el aviso', () => {
    render(<EmployeeContractSection contratos={[]} canLiquidar />)

    expect(screen.getByText(/no tiene un contrato vigente/i)).toBeInTheDocument()
  })

  it('sin contratos anteriores no muestra el historial', () => {
    render(<EmployeeContractSection contratos={[HISTORIAL_ACTIVO]} canLiquidar={false} />)

    expect(
      screen.queryByRole('heading', { name: 'Historial de contrataciones' })
    ).not.toBeInTheDocument()
  })

  it('lista los contratos cerrados con su motivo de salida', () => {
    render(
      <EmployeeContractSection
        contratos={[HISTORIAL_ACTIVO, HISTORIAL_CERRADO]}
        canLiquidar={false}
      />
    )

    const historial = screen.getByRole('table')
    expect(within(historial).getByText('Bodeguero')).toBeInTheDocument()
    expect(within(historial).getByText('Norte')).toBeInTheDocument()
    expect(within(historial).getByText('30/06/2023')).toBeInTheDocument()
    expect(within(historial).getByText('Renuncia Voluntaria')).toBeInTheDocument()
    // El vigente no se repite dentro del historial.
    expect(within(historial).queryByText('Cajera')).not.toBeInTheDocument()
  })

  it('un contrato cerrado sin motivo registrado muestra guión', () => {
    render(
      <EmployeeContractSection
        contratos={[{ ...HISTORIAL_CERRADO, motivo_salida_nombre: null }]}
        canLiquidar={false}
      />
    )

    expect(within(screen.getByRole('table')).getByText('—')).toBeInTheDocument()
  })

  it('con NOMINA_WRITE enlaza a liquidación con el contrato vigente preseleccionado', () => {
    render(<EmployeeContractSection contratos={[HISTORIAL_ACTIVO]} canLiquidar />)

    expect(screen.getByRole('link', { name: /terminar contrato/i })).toHaveAttribute(
      'href',
      '/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=5'
    )
  })

  it('sin NOMINA_WRITE no ofrece terminar el contrato', () => {
    render(<EmployeeContractSection contratos={[HISTORIAL_ACTIVO]} canLiquidar={false} />)

    expect(screen.queryByRole('link', { name: /terminar contrato/i })).not.toBeInTheDocument()
  })

  it('sin contrato vigente no hay nada que terminar, aunque tenga el permiso', () => {
    render(<EmployeeContractSection contratos={[HISTORIAL_CERRADO]} canLiquidar />)

    expect(screen.queryByRole('link', { name: /terminar contrato/i })).not.toBeInTheDocument()
  })
})

describe('liquidacionHref', () => {
  it('arma el deep-link al tab de liquidación', () => {
    expect(liquidacionHref(42)).toBe('/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=42')
  })
})
