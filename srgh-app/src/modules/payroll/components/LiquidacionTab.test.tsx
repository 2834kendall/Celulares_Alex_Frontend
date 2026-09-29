import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiquidacionTab } from './LiquidacionTab'
import { procesarLiquidacion } from '@/modules/payroll/actions/procesarLiquidacion'
import type { ContratoPorLiquidarItem } from '@/modules/payroll/types'

let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payroll/aguinaldo-liquidacion',
  useSearchParams: () => new URLSearchParams(searchString),
}))

vi.mock('@/modules/payroll/actions/procesarLiquidacion', () => ({
  procesarLiquidacion: vi.fn(),
}))

// La propuesta de vacaciones y el pago son server actions con sus propios
// tests: acá devuelven lo mínimo para que el formulario funcione.
vi.mock('@/modules/payroll/actions/proponerVacacionesLiquidacion', () => ({
  proponerVacacionesLiquidacion: vi.fn(() => Promise.resolve({ ok: false, error: 'sin datos' })),
}))

vi.mock('@/modules/payroll/actions/pagarLiquidacion', () => ({
  pagarLiquidacion: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const mockProcesar = vi.mocked(procesarLiquidacion)

const CONTRATOS: ContratoPorLiquidarItem[] = [
  {
    historialLaboralId: 5,
    nombre: 'Ana Mora',
    cedula: '1-1111-1111',
    fechaSalida: '2026-09-20',
    motivo: {
      nombre: 'Renuncia Voluntaria',
      generaCesantia: false,
      generaPreaviso: false,
      notaLegal: null,
    },
  },
  {
    historialLaboralId: 8,
    nombre: 'Luis Solís',
    cedula: '2-2222-2222',
    fechaSalida: '2026-09-15',
    motivo: {
      nombre: 'Despido con Responsabilidad Patronal',
      generaCesantia: true,
      generaPreaviso: true,
      notaLegal: null,
    },
  },
]

function renderTab(contratos: ContratoPorLiquidarItem[] = CONTRATOS) {
  render(<LiquidacionTab contratos={contratos} historial={[]} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  searchString = ''
})

describe('<LiquidacionTab /> — preselección por URL', () => {
  it('sin ?empleado= el selector arranca vacío', () => {
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent('Elegí un contrato')
  })

  it('con ?empleado= de un contrato por liquidar lo deja elegido', () => {
    searchString = 'tab=liquidacion&empleado=8'
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent(
      'Luis Solís — 2-2222-2222 · salió el 15/09/2026'
    )
  })

  // El id viaja en la URL: puede ser de alguien ya liquidado, fuera del alcance
  // de la RLS o escrito a mano. Nunca se preselecciona algo que no esté en la lista.
  it.each(['999', 'abc', '-5', '0', '5.5'])('ignora ?empleado=%s', (valor) => {
    searchString = `tab=liquidacion&empleado=${valor}`
    renderTab()

    expect(screen.getByLabelText('Contrato por liquidar')).toHaveTextContent('Elegí un contrato')
  })
})

describe('<LiquidacionTab /> — contrato terminado desde el perfil', () => {
  it('sin contratos por liquidar explica dónde se terminan', () => {
    renderTab([])

    expect(screen.getByText(/no hay contratos pendientes de liquidar/i)).toBeInTheDocument()
    expect(screen.getByText(/se terminan desde el perfil del empleado/i)).toBeInTheDocument()
  })

  it('muestra la fecha y el motivo que registró RRHH, sin dejarlos editar', () => {
    searchString = 'empleado=8'
    renderTab()

    expect(screen.getByText('15/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Despido con Responsabilidad Patronal')).toBeInTheDocument()
    expect(screen.getByText(/genera cesantía\. genera preaviso\./i)).toBeInTheDocument()
    // Ya no hay campos para capturarlos.
    expect(screen.queryByLabelText('Fecha de salida')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motivo de salida')).not.toBeInTheDocument()
  })

  it('pide confirmación antes de guardar: cancelar no liquida', async () => {
    const user = userEvent.setup()
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: /calcular y guardar liquidación/i }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Ana Mora')

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mockProcesar).not.toHaveBeenCalled()
  })

  it('al confirmar manda solo el contrato y los días de vacaciones', async () => {
    const user = userEvent.setup()
    mockProcesar.mockResolvedValue({ ok: false, error: 'Este contrato ya fue liquidado.' })
    searchString = 'empleado=5'
    renderTab()

    await user.click(screen.getByRole('button', { name: /calcular y guardar liquidación/i }))
    await user.click(await screen.findByRole('button', { name: 'Guardar liquidación' }))

    await waitFor(() =>
      expect(mockProcesar).toHaveBeenCalledWith({
        historialLaboralId: 5,
        diasVacacionesPendientes: 0,
      })
    )
    expect(await screen.findByText('Este contrato ya fue liquidado.')).toBeInTheDocument()
  })
})
