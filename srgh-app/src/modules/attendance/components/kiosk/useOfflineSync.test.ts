import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useOfflineSync } from './useOfflineSync'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import {
  getQueuedMarks,
  queueOfflineMark,
  removeQueuedMark,
} from '@/modules/attendance/components/kiosk/offlineQueue'
import type { KioskMarkInput } from '@/modules/attendance/types'

vi.mock('@/modules/attendance/actions/registerKioskMark', () => ({
  registerKioskMark: vi.fn(),
}))

const mockRegisterKioskMark = vi.mocked(registerKioskMark)

const input: KioskMarkInput = {
  employeeId: 10,
  tipo: 'entrada',
  latitud: null,
  longitud: null,
  pin: null,
  dispositivoId: null,
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('useOfflineSync', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setOnline(true)
    for (const m of await getQueuedMarks()) {
      await removeQueuedMark(m.id)
    }
  })

  it('empieza en linea con cero pendientes', async () => {
    const { result } = renderHook(() => useOfflineSync())

    await waitFor(() => expect(result.current.isOnline).toBe(true))
    expect(result.current.pendingCount).toBe(0)
  })

  it('detecta el estado offline inicial', async () => {
    setOnline(false)
    const { result } = renderHook(() => useOfflineSync())

    await waitFor(() => expect(result.current.isOnline).toBe(false))
  })

  it('encola la marca sin llamar al servidor cuando esta offline', async () => {
    setOnline(false)
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.isOnline).toBe(false))

    let outcome: Awaited<ReturnType<typeof result.current.submitMark>> | undefined
    await act(async () => {
      outcome = await result.current.submitMark(input)
    })

    expect(outcome).toEqual({ queued: true })
    expect(mockRegisterKioskMark).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })

  it('envia directo al servidor cuando esta en linea', async () => {
    mockRegisterKioskMark.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.isOnline).toBe(true))

    let outcome: Awaited<ReturnType<typeof result.current.submitMark>> | undefined
    await act(async () => {
      outcome = await result.current.submitMark(input)
    })

    expect(outcome).toEqual({ queued: false, result: { ok: true } })
    expect(mockRegisterKioskMark).toHaveBeenCalledWith(input)
    expect(result.current.pendingCount).toBe(0)
  })

  it('encola si el servidor esta "en linea" pero la llamada de red falla', async () => {
    mockRegisterKioskMark.mockRejectedValue(new Error('network error'))
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.isOnline).toBe(true))

    let outcome: Awaited<ReturnType<typeof result.current.submitMark>> | undefined
    await act(async () => {
      outcome = await result.current.submitMark(input)
    })

    expect(outcome).toEqual({ queued: true })
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })

  it('no encola un rechazo valido del servidor (ej. PIN incorrecto)', async () => {
    mockRegisterKioskMark.mockResolvedValue({ ok: false, error: 'PIN incorrecto.' })
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.isOnline).toBe(true))

    let outcome: Awaited<ReturnType<typeof result.current.submitMark>> | undefined
    await act(async () => {
      outcome = await result.current.submitMark(input)
    })

    expect(outcome).toEqual({ queued: false, result: { ok: false, error: 'PIN incorrecto.' } })
    expect(result.current.pendingCount).toBe(0)
  })

  it('al sincronizar manda la hora del EVENTO, no la del reintento', async () => {
    // Marca hecha a las 08:00 con la tablet sin red: asi quedo en la cola.
    await queueOfflineMark({
      id: 'marca-de-las-ocho',
      employeeId: 10,
      tipo: 'entrada',
      fechaHora: '2026-08-14 08:00:00',
      latitud: null,
      longitud: null,
      pin: null,
      dispositivoId: null,
    })

    mockRegisterKioskMark.mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    // La red vuelve horas despues y dispara la sincronizacion.
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(mockRegisterKioskMark).toHaveBeenCalled())
    expect(mockRegisterKioskMark).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 10, fechaHora: '2026-08-14 08:00:00' })
    )
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('la marca encolada guarda la hora en que se hizo, no un placeholder', async () => {
    setOnline(false)
    const { result } = renderHook(() => useOfflineSync())
    await waitFor(() => expect(result.current.isOnline).toBe(false))

    await act(async () => {
      await result.current.submitMark(input)
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    const [queued] = await getQueuedMarks()
    expect(queued.fechaHora).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})
