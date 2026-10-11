import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BuscarComprobante } from './BuscarComprobante'
import { buscarComprobante } from '@/modules/payroll/actions/buscarComprobante'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/modules/payroll/actions/buscarComprobante', () => ({ buscarComprobante: vi.fn() }))

const mockBuscar = vi.mocked(buscarComprobante)

describe('<BuscarComprobante />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con un código encontrado abre el comprobante', async () => {
    mockBuscar.mockResolvedValue({ ok: true, href: '/comprobante/7/41' })
    render(<BuscarComprobante />)

    await userEvent.type(
      screen.getByLabelText('Código de verificación del comprobante'),
      'abcd-efgh-jkmn'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Buscar comprobante' }))

    expect(mockBuscar).toHaveBeenCalledWith('abcd-efgh-jkmn')
    expect(push).toHaveBeenCalledWith('/comprobante/7/41')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si no lo encuentra, muestra el motivo y no navega', async () => {
    mockBuscar.mockResolvedValue({ ok: false, error: 'No hay ningún comprobante con el código X.' })
    render(<BuscarComprobante />)

    await userEvent.type(
      screen.getByLabelText('Código de verificación del comprobante'),
      'x{enter}'
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay ningún comprobante con el código X.'
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('si la acción revienta, error genérico', async () => {
    mockBuscar.mockRejectedValue(new Error('red'))
    render(<BuscarComprobante />)

    await userEvent.type(
      screen.getByLabelText('Código de verificación del comprobante'),
      'x{enter}'
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo buscar el comprobante.')
  })
})
