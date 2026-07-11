import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCrudList } from './useCrudList'

describe('useCrudList', () => {
  it('empieza sin edicion, confirmacion ni error activos', () => {
    const { result } = renderHook(() => useCrudList<{ id: number }>(vi.fn()))

    expect(result.current.editing).toBeNull()
    expect(result.current.confirmingId).toBeNull()
    expect(result.current.deletingId).toBeNull()
    expect(result.current.deleteError).toBeNull()
  })

  it('setEditing actualiza el item o modo "new" en edicion', () => {
    const { result } = renderHook(() => useCrudList<{ id: number }>(vi.fn()))

    act(() => result.current.setEditing('new'))
    expect(result.current.editing).toBe('new')

    act(() => result.current.setEditing({ id: 7 }))
    expect(result.current.editing).toEqual({ id: 7 })
  })

  it('requestDelete marca el id a confirmar y cancelDelete lo limpia', () => {
    const { result } = renderHook(() => useCrudList<{ id: number }>(vi.fn()))

    act(() => result.current.requestDelete(3))
    expect(result.current.confirmingId).toBe(3)

    act(() => result.current.cancelDelete())
    expect(result.current.confirmingId).toBeNull()
  })

  it('confirmDelete exitoso llama a deleteAction y limpia el estado sin error', async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useCrudList<{ id: number }>(deleteAction))

    act(() => result.current.requestDelete(5))
    await act(() => result.current.confirmDelete())

    expect(deleteAction).toHaveBeenCalledWith(5)
    expect(result.current.confirmingId).toBeNull()
    expect(result.current.deletingId).toBeNull()
    expect(result.current.deleteError).toBeNull()
  })

  it('marca deletingId mientras la promesa esta pendiente', async () => {
    let resolveDelete!: (value: { ok: true }) => void
    const deleteAction = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveDelete = resolve
        })
    )
    const { result } = renderHook(() => useCrudList<{ id: number }>(deleteAction))

    act(() => result.current.requestDelete(9))
    act(() => {
      result.current.confirmDelete()
    })

    await waitFor(() => expect(result.current.deletingId).toBe(9))

    await act(async () => {
      resolveDelete({ ok: true })
    })
    expect(result.current.deletingId).toBeNull()
  })

  it('confirmDelete fallido guarda el mensaje de error', async () => {
    const deleteAction = vi.fn().mockResolvedValue({ ok: false, error: 'No se pudo eliminar.' })
    const { result } = renderHook(() => useCrudList<{ id: number }>(deleteAction))

    act(() => result.current.requestDelete(1))
    await act(() => result.current.confirmDelete())

    expect(result.current.deleteError).toBe('No se pudo eliminar.')
  })

  it('confirmDelete sin confirmingId no hace nada', async () => {
    const deleteAction = vi.fn()
    const { result } = renderHook(() => useCrudList<{ id: number }>(deleteAction))

    await act(() => result.current.confirmDelete())

    expect(deleteAction).not.toHaveBeenCalled()
  })
})
