import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KioskScreen } from './KioskScreen'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import { getCurrentCoordinates } from '@/modules/attendance/components/kiosk/geolocation'
import { getOrCreateDeviceId } from '@/modules/attendance/components/kiosk/deviceId'

vi.mock('@/modules/attendance/actions/registerKioskMark', () => ({
  registerKioskMark: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/geolocation', () => ({
  getCurrentCoordinates: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/deviceId', () => ({
  getOrCreateDeviceId: vi.fn(() => 'device-123'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockRegisterKioskMark = vi.mocked(registerKioskMark)
const mockGetCurrentCoordinates = vi.mocked(getCurrentCoordinates)
const mockGetOrCreateDeviceId = vi.mocked(getOrCreateDeviceId)

const employees = [
  { employeeId: 10, fullName: 'Ana Perez', birthDateISO: '1990-01-01' },
  { employeeId: 20, fullName: 'Bruno Mora', birthDateISO: null },
]

describe('<KioskScreen />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentCoordinates.mockResolvedValue(null)
    mockGetOrCreateDeviceId.mockReturnValue('device-123')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('no muestra los botones de marca hasta elegir un empleado', () => {
    render(<KioskScreen employees={employees} />)

    expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
  })

  it('muestra los 4 botones de marca tras elegir un empleado', async () => {
    const user = userEvent.setup()
    render(<KioskScreen employees={employees} />)

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))

    expect(screen.getByRole('button', { name: 'Entrada' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salida' })).toBeInTheDocument()
  })

  it('registra la marca con las coordenadas, el dispositivo y sin PIN', async () => {
    mockGetCurrentCoordinates.mockResolvedValue({ latitud: 9.9333, longitud: -84.0833 })
    mockRegisterKioskMark.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(<KioskScreen employees={employees} />)

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: 'Entrada' }))

    expect(mockRegisterKioskMark).toHaveBeenCalledWith({
      employeeId: 10,
      tipo: 'ENTRADA',
      latitud: 9.9333,
      longitud: -84.0833,
      pin: null,
      dispositivoId: 'device-123',
    })
  })

  it('muestra el mensaje de exito y vuelve al buscador luego de 3 segundos', async () => {
    // Timers reales a proposito: mezclar fake timers con actualizaciones
    // de estado de React (el setTimeout de la pantalla de exito) es fragil
    // aca — se espera con tiempo real y un timeout de test mas generoso.
    mockRegisterKioskMark.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(<KioskScreen employees={employees} />)

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: 'Entrada' }))

    expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument(), {
      timeout: 4000,
    })

    expect(screen.getByLabelText('Selecciona tu nombre')).toHaveValue('')
  }, 6000)

  it('abre el teclado de PIN y lo adjunta a la siguiente marca', async () => {
    mockRegisterKioskMark.mockResolvedValue({ ok: true })
    const user = userEvent.setup()

    render(<KioskScreen employees={employees} />)

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))
    await user.click(screen.getByRole('button', { name: /Falló la cámara/ }))

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '0' }))

    await user.click(screen.getByRole('button', { name: 'Entrada' }))

    expect(mockRegisterKioskMark).toHaveBeenCalledWith(expect.objectContaining({ pin: '1990' }))
  })
})
