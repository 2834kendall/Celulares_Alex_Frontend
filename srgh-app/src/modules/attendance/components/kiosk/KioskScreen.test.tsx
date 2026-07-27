import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KioskScreen } from './KioskScreen'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import { verifyFace } from '@/modules/attendance/actions/verifyFace'
import { getCurrentCoordinates } from '@/modules/attendance/components/kiosk/geolocation'
import { getOrCreateDeviceId } from '@/modules/attendance/components/kiosk/deviceId'
import {
  getQueuedMarks,
  removeQueuedMark,
} from '@/modules/attendance/components/kiosk/offlineQueue'
import type { FaceScanProps } from '@/modules/attendance/components/kiosk/face/FaceScan'

vi.mock('@/modules/attendance/actions/registerKioskMark', () => ({
  registerKioskMark: vi.fn(),
}))
vi.mock('@/modules/attendance/actions/verifyFace', () => ({
  verifyFace: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/geolocation', () => ({
  getCurrentCoordinates: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/deviceId', () => ({
  getOrCreateDeviceId: vi.fn(() => 'device-123'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

// FaceScan arrastra MediaPipe e onnxruntime-web (camara y WASM reales): se
// sustituye por un stub que expone sus callbacks para dispararlos a mano.
let faceScanProps: FaceScanProps | null = null
vi.mock('@/modules/attendance/components/kiosk/face/FaceScan', () => ({
  FaceScan: (props: FaceScanProps) => {
    faceScanProps = props
    return <div data-testid="face-scan" />
  },
}))

const mockRegisterKioskMark = vi.mocked(registerKioskMark)
const mockVerifyFace = vi.mocked(verifyFace)
const mockGetCurrentCoordinates = vi.mocked(getCurrentCoordinates)
const mockGetOrCreateDeviceId = vi.mocked(getOrCreateDeviceId)

const FACE_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))

const employees = [
  { employeeId: 10, fullName: 'Ana Perez', birthDateISO: '1990-01-01' },
  { employeeId: 20, fullName: 'Bruno Mora', birthDateISO: null },
]

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('<KioskScreen />', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    faceScanProps = null
    setOnline(true)
    mockGetCurrentCoordinates.mockResolvedValue(null)
    mockGetOrCreateDeviceId.mockReturnValue('device-123')
    for (const m of await getQueuedMarks()) {
      await removeQueuedMark(m.id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
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
      tipo: 'entrada',
      latitud: 9.9333,
      longitud: -84.0833,
      pin: null,
      dispositivoId: 'device-123',
      ticketFacial: null,
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

  it('muestra el aviso de sin conexion y pide el PIN automaticamente al elegir empleado', async () => {
    setOnline(false)
    const user = userEvent.setup()

    render(<KioskScreen employees={employees} />)

    expect(screen.getByText(/Sin conexion/)).toBeInTheDocument()

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))

    expect(screen.getByRole('dialog', { name: 'Ingresa tu año de nacimiento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
  })

  it('offline: guarda la marca localmente y no llama al servidor', async () => {
    setOnline(false)
    const user = userEvent.setup()

    render(<KioskScreen employees={employees} />)

    await user.click(screen.getByLabelText('Selecciona tu nombre'))
    await user.click(screen.getByText('Ana Perez'))

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '0' }))

    await user.click(screen.getByRole('button', { name: 'Entrada' }))

    expect(mockRegisterKioskMark).not.toHaveBeenCalled()
    expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()

    const queued = await getQueuedMarks()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ employeeId: 10, tipo: 'entrada', pin: '1990' })
  })

  describe('modo facial (llave configurada)', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_FACE_VECTOR_KEY', FACE_KEY)
    })

    const PAYLOAD = { iv: 'aXY=', data: 'ZGF0YQ==' }

    async function emitEmbedding() {
      expect(faceScanProps).not.toBeNull()
      await act(async () => {
        await faceScanProps!.onEmbedding(PAYLOAD)
      })
    }

    it('online muestra la camara (FaceScan) en vez del selector de nombre', () => {
      render(<KioskScreen employees={employees} />)

      expect(screen.getByTestId('face-scan')).toBeInTheDocument()
      expect(screen.queryByLabelText('Selecciona tu nombre')).not.toBeInTheDocument()
    })

    it('offline deshabilita la camara de inmediato y cae al flujo de PIN', () => {
      setOnline(false)
      render(<KioskScreen employees={employees} />)

      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Selecciona tu nombre')).toBeInTheDocument()
    })

    it('MATCH: muestra el nombre verificado y marca con el ticket facial, sin PIN', async () => {
      mockVerifyFace.mockResolvedValue({
        ok: true,
        status: 'MATCH',
        employeeId: 10,
        fullName: 'Ana Perez',
        confianza: 'alta',
        ticket: '10.999.firma',
      })
      mockRegisterKioskMark.mockResolvedValue({ ok: true })
      const user = userEvent.setup()

      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      expect(mockVerifyFace).toHaveBeenCalledWith({
        vector: PAYLOAD,
        dispositivoId: 'device-123',
      })
      expect(screen.getByText('Ana Perez')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Entrada' }))

      expect(mockRegisterKioskMark).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 10, ticketFacial: '10.999.firma', pin: null })
      )
    })

    it('REQUIRE_PIN: cae al selector manual y el PIN es obligatorio', async () => {
      mockVerifyFace.mockResolvedValue({ ok: true, status: 'REQUIRE_PIN' })
      const user = userEvent.setup()

      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      // La camara desaparece y aparece el selector.
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()

      await user.click(screen.getByLabelText('Selecciona tu nombre'))
      await user.click(screen.getByText('Ana Perez'))

      // PIN obligatorio: el teclado se abre solo y no hay botones de marca.
      expect(
        screen.getByRole('dialog', { name: 'Ingresa tu año de nacimiento' })
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
    })

    it('DENIED: muestra la pantalla de rostro no reconocido', async () => {
      mockVerifyFace.mockResolvedValue({ ok: true, status: 'DENIED' })

      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      expect(screen.getByText('Rostro no reconocido')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
    })

    it('camara no disponible: cae al flujo manual con PIN', async () => {
      render(<KioskScreen employees={employees} />)

      expect(faceScanProps).not.toBeNull()
      act(() => {
        faceScanProps!.onUnavailable('No se pudo acceder a la camara.')
      })

      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Selecciona tu nombre')).toBeInTheDocument()
    })
  })
})
