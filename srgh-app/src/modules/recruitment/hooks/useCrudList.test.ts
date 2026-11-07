import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCrudList } from './useCrudList'

describe('recruitment delete recovery', () => {
  it('canceling a confirmation never sends a delete request', async () => {
    const remove = vi.fn()
    const { result } = renderHook(() => useCrudList(remove))
    act(() => result.current.requestDelete(8))
    act(() => result.current.cancelDelete())
    expect(await result.current.confirmDelete()).toEqual({ ok: false, error: 'Nada que eliminar.' })
    expect(remove).not.toHaveBeenCalled()
  })

  it('returns a network error and releases pending state so the same item can be retried', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('network detail'))
      .mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useCrudList(remove))
    act(() => result.current.requestDelete(8))
    await act(async () => {
      await expect(result.current.confirmDelete()).resolves.toEqual({
        ok: false,
        error: 'No se pudo eliminar. Reintentá.',
      })
    })
    expect(result.current.deletingId).toBeNull()
    expect(result.current.deleteError).toBe('No se pudo eliminar. Reintentá.')
    act(() => result.current.requestDelete(8))
    await act(async () => {
      expect(await result.current.confirmDelete()).toEqual({ ok: true })
    })
    expect(remove).toHaveBeenNthCalledWith(2, 8)
    expect(result.current.deleteError).toBeNull()
    expect(result.current.deletingId).toBeNull()
  })

  it('keeps a server rejection visible and does not report success', async () => {
    const remove = vi.fn().mockResolvedValue({ ok: false, error: 'Documento en uso.' })
    const { result } = renderHook(() => useCrudList(remove))
    act(() => result.current.requestDelete(8))
    await act(async () => {
      expect(await result.current.confirmDelete()).toEqual({
        ok: false,
        error: 'Documento en uso.',
      })
    })
    expect(result.current.deleteError).toBe('Documento en uso.')
    expect(result.current.deletingId).toBeNull()
  })
})
