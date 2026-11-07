import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCrudList } from './useCrudList'

describe('evaluation rubric delete recovery', () => {
  it('canceling a confirmation does not delete anything', async () => {
    const remove = vi.fn()
    const { result } = renderHook(() => useCrudList(remove))
    act(() => result.current.requestDelete(7))
    act(() => result.current.cancelDelete())
    await act(async () => {
      await result.current.confirmDelete()
    })
    expect(remove).not.toHaveBeenCalled()
  })
  it('clears pending state after a thrown request and allows a new confirmed retry', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useCrudList(remove))
    act(() => result.current.requestDelete(7))
    await act(async () => {
      await expect(result.current.confirmDelete()).resolves.toBeUndefined()
    })
    expect(result.current.deletingId).toBeNull()
    expect(result.current.deleteError).toBe('No se pudo eliminar. Reintentá.')
    act(() => result.current.requestDelete(7))
    await act(async () => {
      await result.current.confirmDelete()
    })
    expect(result.current.deleteError).toBeNull()
    expect(result.current.deletingId).toBeNull()
    expect(remove).toHaveBeenNthCalledWith(2, 7)
  })
})
