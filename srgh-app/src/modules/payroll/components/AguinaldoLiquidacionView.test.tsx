import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AguinaldoLiquidacionView } from './AguinaldoLiquidacionView'

const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/payroll/aguinaldo-liquidacion',
  useSearchParams: () => new URLSearchParams(searchString),
}))

// Este test cubre qué tab se muestra según la URL, no el contenido de cada
// uno: los hijos (que traen sus propias actions) tienen tests aparte.
vi.mock('./AguinaldoTab', () => ({ AguinaldoTab: () => <div>Contenido aguinaldo</div> }))
vi.mock('./LiquidacionTab', () => ({ LiquidacionTab: () => <div>Formulario liquidación</div> }))
vi.mock('./LiquidacionesHistorial', () => ({
  LiquidacionesHistorial: () => <div>Historial liquidaciones</div>,
}))

function renderView(canWrite = true) {
  render(
    <AguinaldoLiquidacionView
      anio={2026}
      aguinaldos={[]}
      canWrite={canWrite}
      empleadosActivos={[]}
      motivos={[]}
      liquidaciones={[]}
    />
  )
}

describe('<AguinaldoLiquidacionView />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('sin ?tab= abre en Aguinaldo, como antes', () => {
    renderView()

    expect(screen.getByText('Contenido aguinaldo')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aguinaldo/ })).toHaveAttribute('aria-selected', 'true')
  })

  // Es lo que permite el enlace "Terminar contrato" del perfil del empleado.
  it('con ?tab=liquidacion abre directo en Liquidación', () => {
    searchString = 'tab=liquidacion'
    renderView()

    expect(screen.getByText('Formulario liquidación')).toBeInTheDocument()
    expect(screen.queryByText('Contenido aguinaldo')).not.toBeInTheDocument()
  })

  it('cambiar de tab navega escribiendo el query param', async () => {
    renderView()

    await userEvent.click(screen.getByRole('tab', { name: /Liquidación/ }))

    expect(push).toHaveBeenCalledWith('/payroll/aguinaldo-liquidacion?tab=liquidacion')
  })

  it('sin NOMINA_WRITE muestra el aviso de permiso y el historial', () => {
    searchString = 'tab=liquidacion'
    renderView(false)

    expect(screen.getByText(/no tenés permiso para procesar liquidaciones/i)).toBeInTheDocument()
    expect(screen.getByText('Historial liquidaciones')).toBeInTheDocument()
    expect(screen.queryByText('Formulario liquidación')).not.toBeInTheDocument()
  })
})
