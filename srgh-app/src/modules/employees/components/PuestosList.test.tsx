import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PuestosList } from './PuestosList'
import type { Puesto } from '@/modules/employees/actions/listPuestos'

vi.mock('@/modules/employees/actions/deletePuesto', () => ({
  deletePuesto: vi.fn(),
}))

vi.mock('@/modules/employees/actions/createPuesto', () => ({
  createPuesto: vi.fn(),
}))

vi.mock('@/modules/employees/actions/updatePuesto', () => ({
  updatePuesto: vi.fn(),
}))

const PUESTOS: Puesto[] = [
  {
    pue_id: 1,
    pue_empresa_id: 1,
    pue_nombre: 'Cajero',
    pue_descripcion: 'Atiende caja',
    pue_salario_minimo_referencia: 350000,
    pue_activo: true,
  },
  {
    pue_id: 2,
    pue_empresa_id: 1,
    pue_nombre: 'Supervisor',
    pue_descripcion: null,
    pue_salario_minimo_referencia: 425500.5,
    pue_activo: true,
  },
  {
    pue_id: 3,
    pue_empresa_id: 1,
    pue_nombre: 'Pasante',
    pue_descripcion: null,
    pue_salario_minimo_referencia: null,
    pue_activo: false,
  },
]

describe('<PuestosList />', () => {
  it('formatea los salarios con el símbolo ₡ en tarjetas móviles y tabla de escritorio, y muestra — para null', () => {
    render(<PuestosList puestos={PUESTOS} canWrite />)

    const listaMovil = screen.getByRole('list')
    expect(within(listaMovil).getByText('Salario mínimo: ₡350 000')).toBeInTheDocument()
    expect(within(listaMovil).getByText('Salario mínimo: ₡425 500,50')).toBeInTheDocument()
    expect(within(listaMovil).getByText('Salario mínimo: —')).toBeInTheDocument()

    const tabla = screen.getByRole('table')
    expect(within(tabla).getByText('₡350 000')).toBeInTheDocument()
    expect(within(tabla).getByText('₡425 500,50')).toBeInTheDocument()

    const filaPasante = within(tabla).getByText('Pasante').closest('tr')!
    // Descripción null y salario null muestran '—' en sus celdas.
    expect(within(filaPasante).getAllByText('—')).toHaveLength(2)
  })

  it('muestra la etiqueta Salario mínimo de referencia (₡) al abrir el formulario', async () => {
    const user = userEvent.setup()
    render(<PuestosList puestos={PUESTOS} canWrite />)

    await user.click(screen.getByRole('button', { name: /nuevo puesto/i }))

    expect(screen.getByLabelText('Salario mínimo de referencia (₡)')).toBeInTheDocument()
  })
})
