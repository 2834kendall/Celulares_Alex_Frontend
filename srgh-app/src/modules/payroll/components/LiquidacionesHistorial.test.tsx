import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'
import { pagarLiquidacion } from '@/modules/payroll/actions/pagarLiquidacion'
import type { LiquidacionListItem } from '@/modules/payroll/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/modules/payroll/actions/pagarLiquidacion', () => ({ pagarLiquidacion: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockPagar = vi.mocked(pagarLiquidacion)

function item(overrides: Partial<LiquidacionListItem> = {}): LiquidacionListItem {
  return {
    liqId: 1,
    empleadoNombre: 'Ana Pérez',
    empleadoCedula: '1-2222-3333',
    fechaSalida: '2026-07-15',
    motivoNombre: 'Renuncia',
    total: 300000,
    neto: 300000,
    pagado: false,
    pagoId: null,
    fechaPago: null,
    createdAt: '2026-07-15T10:00:00',
    ...overrides,
  }
}

/**
 * El componente rinde la MISMA data dos veces: tarjetas en movil y tabla
 * desde el ancho de contenedor 3xl. jsdom no aplica CSS y ve las dos, asi
 * que se consulta dentro de la tabla en vez de relajar a getAllBy*.
 */
function tabla() {
  return within(screen.getByRole('table'))
}

describe('<LiquidacionesHistorial />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra un mensaje si todavía no hay liquidaciones', () => {
    render(<LiquidacionesHistorial items={[]} />)

    // Sin datos no se rinde ninguna de las dos ramas: consulta global.
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

    expect(tabla().getByText('Ana Pérez')).toBeInTheDocument()
    expect(tabla().getByText('Luis Solano')).toBeInTheDocument()
    expect(tabla().getByText('Pagada')).toBeInTheDocument()
    expect(tabla().getByText('Pendiente de pago')).toBeInTheDocument()
  })

  it('pagina cuando hay más de 8 liquidaciones', async () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      item({ liqId: i + 1, empleadoNombre: `Empleado ${i + 1}` })
    )
    render(<LiquidacionesHistorial items={items} />)

    expect(tabla().getByText('Empleado 1')).toBeInTheDocument()
    expect(tabla().queryByText('Empleado 9')).not.toBeInTheDocument()
    // La paginacion es comun a las dos ramas, vive fuera de la tabla.
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Página siguiente'))

    expect(tabla().getByText('Empleado 9')).toBeInTheDocument()
  })

  it('sin permiso de escritura no ofrece pagar', () => {
    render(<LiquidacionesHistorial items={[item()]} />)

    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
  })

  it('Pagar registra el pago de ESA liquidación y refresca la lista', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockPagar.mockResolvedValue({ ok: true, pagoId: 9 })
    render(<LiquidacionesHistorial items={[item({ liqId: 5 })]} canWrite />)

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))

    expect(mockPagar).toHaveBeenCalledWith(5)
    expect(refresh).toHaveBeenCalled()
  })

  it('si cancela la confirmación no paga', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<LiquidacionesHistorial items={[item()]} canWrite />)

    await user.click(tabla().getByRole('button', { name: 'Pagar' }))

    expect(mockPagar).not.toHaveBeenCalled()
  })

  it('una liquidación pagada muestra el enlace a su comprobante', () => {
    render(<LiquidacionesHistorial items={[item({ pagado: true, pagoId: 12 })]} canWrite />)

    expect(tabla().getByRole('link', { name: /Comprobante/ })).toHaveAttribute(
      'href',
      '/comprobante/extraordinario/12'
    )
    expect(tabla().queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
  })
})
