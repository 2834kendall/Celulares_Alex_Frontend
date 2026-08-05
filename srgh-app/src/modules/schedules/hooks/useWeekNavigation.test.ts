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

  it('goToWeekStart navega a la semana indicada', async () => {
    const { result } = renderHook(() => useWeekNavigation('2026-01-05'))

    act(() => result.current.goToWeekStart('2026-01-12'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/schedule?week=2026-01-12'))
  })

  it('goToWeekStart funciona cruzando el limite de mes/anio', async () => {
    const { result } = renderHook(() => useWeekNavigation('2025-12-29'))

    act(() => result.current.goToWeekStart('2026-01-05'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/schedule?week=2026-01-05'))
  })

  it('goToWeekStart no navega si ya se esta en esa semana', () => {
    const { result } = renderHook(() => useWeekNavigation('2026-01-05'))

    act(() => result.current.goToWeekStart('2026-01-05'))

    expect(push).not.toHaveBeenCalled()
  })
})
