import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'
import type { LiquidacionListItem } from '@/modules/payroll/types'

function item(overrides: Partial<LiquidacionListItem> = {}): LiquidacionListItem {
  return {
    liqId: 1,
    empleadoNombre: 'Ana Pérez',
    empleadoCedula: '1-2222-3333',
    fechaSalida: '2026-07-15',
    motivoNombre: 'Renuncia',
    total: 300000,
    pagado: false,
    createdAt: '2026-07-15T10:00:00',
    ...overrides,
  }
}

describe('<LiquidacionesHistorial />', () => {
  it('muestra un mensaje si todavía no hay liquidaciones', () => {
    render(<LiquidacionesHistorial items={[]} />)

    expect(screen.getByText('Todavía no se ha generado ninguna liquidación.')).toBeInTheDocument()
  })

  it('muestra los datos de cada liquidación', () => {
    render(
      <LiquidacionesHistorial
        items={[
          item({ liqId: 1, pagado: true }),
          item({ liqId: 2, empleadoNombre: 'Luis Solano' }),
        ]}
      />
    )

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Luis Solano')).toBeInTheDocument()
    expect(screen.getByText('Pagada')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('pagina cuando hay más de 8 liquidaciones', async () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      item({ liqId: i + 1, empleadoNombre: `Empleado ${i + 1}` })
    )
    render(<LiquidacionesHistorial items={items} />)

    expect(screen.getByText('Empleado 1')).toBeInTheDocument()
    expect(screen.queryByText('Empleado 9')).not.toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Página siguiente'))

    expect(screen.getByText('Empleado 9')).toBeInTheDocument()
  })
})
