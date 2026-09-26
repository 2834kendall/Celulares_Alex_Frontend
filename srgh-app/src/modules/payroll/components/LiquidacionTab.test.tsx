import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiquidacionTab } from './LiquidacionTab'
import type { EmpleadoActivoItem } from '@/modules/payroll/types'

let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payroll/aguinaldo-liquidacion',
  useSearchParams: () => new URLSearchParams(searchString),
}))

vi.mock('@/modules/payroll/actions/procesarLiquidacion', () => ({
  procesarLiquidacion: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const EMPLEADOS: EmpleadoActivoItem[] = [
  { historialLaboralId: 5, nombre: 'Ana Mora', cedula: '1-1111-1111' },
  { historialLaboralId: 8, nombre: 'Luis Solís', cedula: '2-2222-2222' },
]

function renderTab() {
  render(<LiquidacionTab empleados={EMPLEADOS} motivos={[]} historial={[]} />)
}

describe('<LiquidacionTab /> — preselección por URL', () => {
  beforeEach(() => {
    searchString = ''
  })

  it('sin ?empleado= el selector arranca vacío, como siempre', () => {
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Elegí un empleado')
  })

  it('con ?empleado= de un contrato liquidable lo deja elegido', () => {
    searchString = 'tab=liquidacion&empleado=8'
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Luis Solís — 2-2222-2222')
  })

  // El id viaja en la URL: puede ser de alguien ya liquidado, fuera del alcance
  // de la RLS o escrito a mano. Nunca se preselecciona algo que no esté en la lista.
  it.each(['999', 'abc', '-5', '0', '5.5'])('ignora ?empleado=%s', (valor) => {
    searchString = `tab=liquidacion&empleado=${valor}`
    renderTab()

    expect(screen.getByLabelText('Empleado')).toHaveTextContent('Elegí un empleado')
  })
})
