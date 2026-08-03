import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMonthNavigation } from './useMonthNavigation'

const push = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/attendance',
  useSearchParams: () => params,
}))

describe('useMonthNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    params = new URLSearchParams()
  })

  it('goToNextMonth navega al primer dia del mes siguiente', async () => {
    const { result } = renderHook(() => useMonthNavigation('2026-07-01'))

    act(() => result.current.goToNextMonth())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/attendance?month=2026-08-01'))
  })

  it('goToPreviousMonth navega al primer dia del mes anterior', async () => {
    const { result } = renderHook(() => useMonthNavigation('2026-07-01'))

    act(() => result.current.goToPreviousMonth())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/attendance?month=2026-06-01'))
  })

  it('cruza correctamente el limite de anio', async () => {
    const { result } = renderHook(() => useMonthNavigation('2026-01-01'))

    act(() => result.current.goToPreviousMonth())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/attendance?month=2025-12-01'))
  })

  it('no salta de mes por dias distintos a 1 (ej. 31 ene + 1 mes)', async () => {
    // Aunque el hook siempre recibe "YYYY-MM-01" en la practica, se prueba
    // el caso limite para confirmar que el dia se fija en 1 antes de sumar.
    const { result } = renderHook(() => useMonthNavigation('2026-01-31'))

    act(() => result.current.goToNextMonth())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/attendance?month=2026-02-01'))
  })

  it('preserva otros parametros de la URL (ej. ?tab=resumen)', async () => {
    params = new URLSearchParams('tab=resumen')
    const { result } = renderHook(() => useMonthNavigation('2026-07-01'))

    act(() => result.current.goToNextMonth())

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/attendance?tab=resumen&month=2026-08-01')
    )
  })
})
