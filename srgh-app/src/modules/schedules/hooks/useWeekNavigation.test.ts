import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeekNavigation } from './useWeekNavigation'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/schedule',
}))

describe('useWeekNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('goToNextWeek navega 7 dias adelante manteniendo el pathname', async () => {
    const { result } = renderHook(() => useWeekNavigation('2026-01-05'))

    act(() => result.current.goToNextWeek())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/schedule?week=2026-01-12'))
  })

  it('goToPreviousWeek navega 7 dias atras', async () => {
    const { result } = renderHook(() => useWeekNavigation('2026-01-05'))

    act(() => result.current.goToPreviousWeek())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/schedule?week=2025-12-29'))
  })

  it('cruza correctamente el limite de mes/anio', async () => {
    const { result } = renderHook(() => useWeekNavigation('2025-12-29'))

    act(() => result.current.goToNextWeek())

    await waitFor(() => expect(push).toHaveBeenCalledWith('/schedule?week=2026-01-05'))
  })
})
