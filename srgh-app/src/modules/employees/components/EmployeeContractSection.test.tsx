import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EmployeeContractSection } from './EmployeeContractSection'
import { HISTORIAL_ACTIVO, HISTORIAL_CERRADO } from './testFixtures'
import type { ContratoDetalle } from '@/modules/employees/types'

/** El último contrato, terminado y todavía sin liquidar. */
const TERMINADO_SIN_LIQUIDAR: ContratoDetalle = {
  ...HISTORIAL_ACTIVO,
  lab_fecha_fin: '2026-09-20',
  lab_motivo_salida_id: 1,
  motivo_salida_nombre: 'Renuncia Voluntaria',
  liquidado: false,
}

function renderSection(contratos: ContratoDetalle[], veLiquidaciones = false, veSalarios = true) {
  return render(
    <EmployeeContractSection
      contratos={contratos}
      veLiquidaciones={veLiquidaciones}
      veSalarios={veSalarios}
    />
  )
}

describe('<EmployeeContractSection />', () => {
  it('muestra el contrato vigente con sus dos salarios', () => {
    renderSection([HISTORIAL_ACTIVO])

    expect(screen.getByText('Cajera')).toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('Indefinido')).toBeInTheDocument()
    expect(screen.getByText('01/02/2024')).toBeInTheDocument()
    expect(screen.getByText('Salario base')).toBeInTheDocument()
    expect(screen.getByText('Salario real')).toBeInTheDocument()
  })

  it('sin acciones no muestra botones: la sección solo presenta datos', () => {
    renderSection([HISTORIAL_ACTIVO], true)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('sin contratos muestra el aviso', () => {
    renderSection([])

    expect(screen.getByText(/no tiene un contrato vigente/i)).toBeInTheDocument()
  })

  it('sin contratos anteriores no muestra el historial', () => {
    renderSection([HISTORIAL_ACTIVO])

    expect(
      screen.queryByRole('heading', { name: 'Historial de contrataciones' })
    ).not.toBeInTheDocument()
  })

  it('lista los contratos cerrados con su motivo de salida', () => {
    renderSection([HISTORIAL_ACTIVO, HISTORIAL_CERRADO])

    const historial = screen.getByRole('table')
    expect(within(historial).getByText('Bodeguero')).toBeInTheDocument()
    expect(within(historial).getByText('Norte')).toBeInTheDocument()
    expect(within(historial).getByText('30/06/2023')).toBeInTheDocument()
    expect(within(historial).getByText('Renuncia Voluntaria')).toBeInTheDocument()
    // El vigente no se repite dentro del historial.
    expect(within(historial).queryByText('Cajera')).not.toBeInTheDocument()
  })

  it('un contrato cerrado sin motivo registrado muestra guión', () => {
    renderSection([{ ...HISTORIAL_CERRADO, motivo_salida_nombre: null }])

    expect(within(screen.getByRole('table')).getByText('—')).toBeInTheDocument()
  })

  it('una terminación programada se anuncia con su último día', () => {
    renderSection([
      {
        ...HISTORIAL_ACTIVO,
        lab_fecha_fin_programada: '2026-10-15',
        motivo_salida_nombre: 'Renuncia Voluntaria',
      },
    ])

    expect(screen.getByText(/último día: 15\/10\/2026/i)).toBeInTheDocument()
  })

  it('terminado sin liquidar: lo avisa y marca la fila del historial', () => {
    renderSection([TERMINADO_SIN_LIQUIDAR, HISTORIAL_CERRADO], true)

    expect(screen.getByText(/pendiente de\s+liquidar\./i)).toBeInTheDocument()
    // Solo la del terminado; HISTORIAL_CERRADO ya se liquidó.
    expect(within(screen.getByRole('table')).getAllByText('Pendiente de liquidar')).toHaveLength(1)
  })

  // Sin permisos que vean liquidaciones, la RLS las oculta: todo cerrado
  // parecería pendiente. Mejor no afirmar nada.
  it('quien no ve liquidaciones no recibe avisos de "pendiente de liquidar"', () => {
    renderSection([TERMINADO_SIN_LIQUIDAR], false)

    expect(screen.queryByText(/pendiente de liquidar/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no tiene un contrato vigente/i)).toBeInTheDocument()
  })

  it('oculta Salario base y Salario real sin NOMINA_READ o cuando llegan en null', () => {
    const { rerender } = renderSection([HISTORIAL_ACTIVO], false, false)

    expect(screen.queryByText('Salario base')).not.toBeInTheDocument()
    expect(screen.queryByText('Salario real')).not.toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()

    rerender(
      <EmployeeContractSection
        contratos={[{ ...HISTORIAL_ACTIVO, lab_salario_base: null, lab_salario_real: null }]}
        veLiquidaciones={false}
        veSalarios={true}
      />
    )
    expect(screen.queryByText('Salario base')).not.toBeInTheDocument()
    expect(screen.queryByText('Salario real')).not.toBeInTheDocument()
  })

  it('indica cuando el empleado tiene un contrato vigente en otra sucursal oculta', () => {
    render(
      <EmployeeContractSection
        contratos={[]}
        veLiquidaciones={true}
        contratoVigenteOtraSucursal={true}
      />
    )

    expect(
      screen.getByText('Este empleado tiene un contrato vigente en otra sucursal.')
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/no tiene un contrato vigente en la empresa/i)
    ).not.toBeInTheDocument()
  })
})
