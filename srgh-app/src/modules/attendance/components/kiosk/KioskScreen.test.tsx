import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KioskScreen } from './KioskScreen'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import { verifyFace } from '@/modules/attendance/actions/verifyFace'
import { getKioskMarkOptions } from '@/modules/attendance/actions/getKioskMarkOptions'
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
vi.mock('@/modules/attendance/actions/getKioskMarkOptions', () => ({
  getKioskMarkOptions: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/geolocation', () => ({
  getCurrentCoordinates: vi.fn(),
}))
vi.mock('@/modules/attendance/components/kiosk/deviceId', () => ({
  getOrCreateDeviceId: vi.fn(() => 'device-123'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }))

// FaceScan arrastra MediaPipe y face-api.js (camara y modelo reales): se
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
const mockGetKioskMarkOptions = vi.mocked(getKioskMarkOptions)
const mockGetCurrentCoordinates = vi.mocked(getCurrentCoordinates)
const mockGetOrCreateDeviceId = vi.mocked(getOrCreateDeviceId)

const FACE_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)))
const PAYLOAD = { iv: 'aXY=', data: 'ZGF0YQ==' }
const TICKET = '10.999.firma'

const employees = [
  { employeeId: 10, fullName: 'Ana Perez' },
  { employeeId: 20, fullName: 'Bruno Mora' },
]

const MATCH = {
  ok: true as const,
  status: 'MATCH' as const,
  employeeId: 10,
  fullName: 'Ana Perez',
  confianza: 'alta' as const,
  ticket: TICKET,
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

async function emitEmbedding() {
  expect(faceScanProps).not.toBeNull()
  await act(async () => {
    await faceScanProps!.onEmbedding(PAYLOAD)
  })
}

/** Renderiza y deja a Ana reconocida por la camara. */
async function renderRecognized() {
  mockVerifyFace.mockResolvedValue(MATCH)
  render(<KioskScreen employees={employees} />)
  await emitEmbedding()
}

describe('<KioskScreen />', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_FACE_VECTOR_KEY', FACE_KEY)
    faceScanProps = null
    setOnline(true)
    mockGetCurrentCoordinates.mockResolvedValue(null)
    mockGetOrCreateDeviceId.mockReturnValue('device-123')
    // Por defecto la persona todavia no marco nada hoy: solo le toca entrar.
    mockGetKioskMarkOptions.mockResolvedValue({ ok: true, allowed: ['entrada'] })
    for (const m of await getQueuedMarks()) {
      await removeQueuedMark(m.id)
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  describe('antes de reconocer', () => {
    it('muestra la camara y ningun boton de marca ni selector de nombre', () => {
      render(<KioskScreen employees={employees} />)

      expect(screen.getByTestId('face-scan')).toBeInTheDocument()
      expect(screen.getByText('Mira a la camara')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    it('sin turnos hoy no enciende la camara', () => {
      render(<KioskScreen employees={[]} />)

      expect(screen.getByText('Hoy no hay turnos en esta sucursal')).toBeInTheDocument()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('sin la llave de Face ID no se puede marcar', () => {
      vi.stubEnv('NEXT_PUBLIC_FACE_VECTOR_KEY', '')
      render(<KioskScreen employees={employees} />)

      expect(screen.getByText('Face ID no esta configurado')).toBeInTheDocument()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('offline no ofrece otra forma de marcar: pide avisar al encargado', async () => {
      setOnline(false)
      render(<KioskScreen employees={employees} />)

      expect(await screen.findByText('Sin conexion')).toBeInTheDocument()
      expect(screen.getByText(/avisa al encargado/)).toBeInTheDocument()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })
  })

  describe('con el rostro reconocido', () => {
    it('saluda por nombre y ofrece solo las marcas que corresponden', async () => {
      await renderRecognized()

      expect(mockVerifyFace).toHaveBeenCalledWith({
        vector: PAYLOAD,
        dispositivoId: 'device-123',
      })
      expect(screen.getByText('Ana Perez')).toBeInTheDocument()
      expect(mockGetKioskMarkOptions).toHaveBeenCalledWith(10)
      expect(await screen.findByRole('button', { name: 'Entrada' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Salida' })).not.toBeInTheDocument()
    })

    it('con el almuerzo abierto solo ofrece su fin', async () => {
      mockGetKioskMarkOptions.mockResolvedValue({ ok: true, allowed: ['fin_almuerzo'] })
      await renderRecognized()

      expect(await screen.findByRole('button', { name: 'Fin de almuerzo' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Inicio de receso' })).not.toBeInTheDocument()
    })

    it('despues de la salida no ofrece ninguna marca', async () => {
      mockGetKioskMarkOptions.mockResolvedValue({ ok: true, allowed: [] })
      await renderRecognized()

      expect(await screen.findByText('Ya registraste tu salida de hoy.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
    })

    it('muestra el motivo si el servidor no deja marcar, sin botones', async () => {
      mockGetKioskMarkOptions.mockResolvedValue({
        ok: false,
        error: 'No tienes turno asignado en esta sucursal hoy.',
      })
      await renderRecognized()

      expect(
        await screen.findByText('No tienes turno asignado en esta sucursal hoy.')
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
    })

    it('marca con el ticket facial, las coordenadas y el dispositivo', async () => {
      mockGetCurrentCoordinates.mockResolvedValue({ latitud: 9.9333, longitud: -84.0833 })
      mockRegisterKioskMark.mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      await renderRecognized()

      await user.click(await screen.findByRole('button', { name: 'Entrada' }))

      await waitFor(() =>
        expect(mockRegisterKioskMark).toHaveBeenCalledWith({
          employeeId: 10,
          tipo: 'entrada',
          latitud: 9.9333,
          longitud: -84.0833,
          dispositivoId: 'device-123',
          ticketFacial: TICKET,
        })
      )
      expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()
    })

    it('tras el exito vuelve a la camara a los 3 segundos', async () => {
      mockRegisterKioskMark.mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      await renderRecognized()

      await user.click(await screen.findByRole('button', { name: 'Entrada' }))
      expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()

      await waitFor(() => expect(screen.getByTestId('face-scan')).toBeInTheDocument(), {
        timeout: 4000,
      })
      expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument()
    })

    it('si el servidor rechaza la marca, vuelve a preguntar que corresponde', async () => {
      mockRegisterKioskMark.mockResolvedValue({
        ok: false,
        error: 'No corresponde marcar entrada ahora.',
        definitivo: true,
      })
      const user = userEvent.setup()
      await renderRecognized()

      await user.click(await screen.findByRole('button', { name: 'Entrada' }))

      await waitFor(() => expect(mockGetKioskMarkOptions).toHaveBeenCalledTimes(2))
      expect(screen.queryByText('Entrada registrada')).not.toBeInTheDocument()
    })

    it('"No soy yo" descarta la identidad y vuelve a la camara', async () => {
      const user = userEvent.setup()
      await renderRecognized()

      await user.click(await screen.findByRole('button', { name: /No soy yo/ }))

      expect(screen.getByTestId('face-scan')).toBeInTheDocument()
      expect(screen.queryByText('Ana Perez')).not.toBeInTheDocument()
    })

    it('si se corta la red despues de reconocer, la marca se encola con su ticket', async () => {
      const user = userEvent.setup()
      await renderRecognized()
      await screen.findByRole('button', { name: 'Entrada' })

      setOnline(false)
      act(() => {
        window.dispatchEvent(new Event('offline'))
      })

      await user.click(screen.getByRole('button', { name: 'Entrada' }))

      expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()
      expect(mockRegisterKioskMark).not.toHaveBeenCalled()
      const queued = await getQueuedMarks()
      expect(queued).toHaveLength(1)
      expect(queued[0]).toMatchObject({ employeeId: 10, tipo: 'entrada', ticketFacial: TICKET })
    })
  })

  describe('cuando Face ID no alcanza', () => {
    it('DENIED: no reconocido, pide avisar al encargado, sin forma de marcar', async () => {
      mockVerifyFace.mockResolvedValue({ ok: true, status: 'DENIED' })
      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      expect(screen.getByText('No te reconocimos')).toBeInTheDocument()
      expect(screen.getByText(/avisa al encargado/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument()
    })

    it('zona de duda: ofrece reintentar, y reintentar vuelve a la camara', async () => {
      mockVerifyFace.mockResolvedValue({ ok: true, status: 'REQUIRE_PIN' })
      const user = userEvent.setup()
      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      expect(screen.getByText('No pudimos confirmar tu identidad')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Intentar de nuevo/ }))
      expect(screen.getByTestId('face-scan')).toBeInTheDocument()
    })

    it('una foto frente a la camara se rechaza sin consultar al servidor', () => {
      render(<KioskScreen employees={employees} />)

      act(() => {
        faceScanProps!.onSpoof!()
      })

      expect(screen.getByText('Necesitamos a la persona')).toBeInTheDocument()
      expect(mockVerifyFace).not.toHaveBeenCalled()
    })

    it('camara no disponible: explica el motivo y pide avisar al encargado', () => {
      render(<KioskScreen employees={employees} />)

      act(() => {
        faceScanProps!.onUnavailable('No se pudo acceder a la camara.')
      })

      expect(screen.getByText('La camara no esta disponible')).toBeInTheDocument()
      expect(screen.getByText(/No se pudo acceder a la camara\./)).toBeInTheDocument()
    })

    it('error del servidor al verificar: pide avisar al encargado', async () => {
      mockVerifyFace.mockResolvedValue({ ok: false, error: 'Servicio no disponible.' })
      render(<KioskScreen employees={employees} />)
      await emitEmbedding()

      expect(screen.getByText('No pudimos verificarte')).toBeInTheDocument()
      expect(screen.getByText(/Servicio no disponible\./)).toBeInTheDocument()
    })
  })
})
