import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BancoHorasView } from './BancoHorasView'
import { compensarBancoHoras } from '@/modules/payroll/actions/compensarBancoHoras'
import type { BancoHorasItem } from '@/modules/payroll/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/payroll/actions/pagarBancoHoras', () => ({ pagarBancoHoras: vi.fn() }))
vi.mock('@/modules/payroll/actions/compensarBancoHoras', () => ({
  compensarBancoHoras: vi.fn(),
}))
vi.mock('@/modules/payroll/actions/revertirBancoHoras', () => ({ revertirBancoHoras: vi.fn() }))

const mockCompensar = vi.mocked(compensarBancoHoras)

function mov(over: Partial<BancoHorasItem> = {}): BancoHorasItem {
  return {
    id: 1,
    historialLaboralId: 5,
    empleadoNombre: 'Ana Mora',
    empleadoCedula: '1-1111-1111',
    periodoOrigenLabel: 'Agosto 2026 · 2ª quincena',
    horas: 0.5,
    salarioPorHora: 1750,
    montoSugerido: 1312.5,
    factorSugerido: 1.5,
    estado: 'pendiente',
    montoPagado: null,
    fechaResolucion: null,
    createdAt: '2026-08-20T10:00:00',
    observaciones: null,
    liquidadoSinIncluir: null,
    ...over,
  }
}

const IVANNIA = mov({
  id: 2,
  empleadoNombre: 'Ivannia Solís',
  liquidadoSinIncluir: { liqId: 4, fechaSalida: '2026-10-07' },
})

function tabla() {
  return within(screen.getByRole('table'))
}

describe('<BancoHorasView /> horas que una liquidación dejó fuera', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dice por qué no se pagan y no ofrece Pagar', () => {
    render(<BancoHorasView pendientes={[mov(), IVANNIA]} historial={[]} canWrite />)

    const fila = tabla().getByText('Ivannia Solís').closest('tr')!
    expect(
      within(fila).getByText(/Ya se liquidó \(n\.° 4, salida del 07\/10\/2026\)/)
    ).toBeInTheDocument()
    expect(within(fila).queryByRole('button', { name: 'Pagar' })).not.toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Compensar con nota' })).toBeInTheDocument()
    // Las de alguien que sigue trabajando, como siempre.
    const ana = tabla().getByText('Ana Mora').closest('tr')!
    expect(within(ana).getByRole('button', { name: 'Pagar' })).toBeInTheDocument()
  })

  it('cerrarlas pide una nota y la manda', async () => {
    const user = userEvent.setup()
    mockCompensar.mockResolvedValue({ ok: true })
    render(<BancoHorasView pendientes={[IVANNIA]} historial={[]} canWrite />)

    await user.click(tabla().getByRole('button', { name: 'Compensar con nota' }))
    const dialogo = screen.getByRole('dialog')
    const confirmar = within(dialogo).getByRole('button', { name: 'Registrar como compensadas' })
    expect(confirmar).toBeDisabled()
    // Ni en la tabla ni en las tarjetas del celular se ofrece pagarlas.
    expect(screen.queryAllByRole('button', { name: 'Pagar' })).toEqual([])

    await user.type(within(dialogo).getByLabelText('Nota (obligatoria)'), 'Se le pagó por fuera.')
    await user.click(confirmar)

    expect(mockCompensar).toHaveBeenCalledWith(2, 'Se le pagó por fuera.')
  })

  it('el historial muestra la nota', async () => {
    const user = userEvent.setup()
    render(
      <BancoHorasView
        pendientes={[]}
        historial={[mov({ estado: 'compensado', observaciones: 'Se le pagó por fuera.' })]}
        canWrite
      />
    )

    await user.click(screen.getByRole('button', { name: /Historial/ }))

    expect(tabla().getByText('Nota: Se le pagó por fuera.')).toBeInTheDocument()
  })
})
