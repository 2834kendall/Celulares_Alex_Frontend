import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePagination } from './usePagination'

describe('usePagination', () => {
  it('pagina 1 con el primer bloque de items usando el tamano de pagina por defecto', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const { result } = renderHook(() => usePagination(items))

    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.paginatedItems).toEqual(items.slice(0, 8))
  })

  it('respeta un pageSize personalizado', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const { result } = renderHook(() => usePagination(items, 4))

    expect(result.current.totalPages).toBe(3)
    expect(result.current.paginatedItems).toEqual([0, 1, 2, 3])
  })

  it('totalPages es al menos 1 aunque no haya items', () => {
    const { result } = renderHook(() => usePagination([], 8))

    expect(result.current.totalPages).toBe(1)
    expect(result.current.paginatedItems).toEqual([])
  })

  it('goToNextPage avanza y goToPreviousPage retrocede', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const { result } = renderHook(() => usePagination(items, 8))

    act(() => result.current.goToNextPage())
    expect(result.current.page).toBe(2)
    expect(result.current.paginatedItems).toEqual(items.slice(8, 16))

    act(() => result.current.goToPreviousPage())
    expect(result.current.page).toBe(1)
  })

  it('goToNextPage no pasa de totalPages', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const { result } = renderHook(() => usePagination(items, 8))

    act(() => result.current.goToNextPage())
    act(() => result.current.goToNextPage())

    expect(result.current.page).toBe(2)
  })

  it('goToPreviousPage no baja de 1', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const { result } = renderHook(() => usePagination(items, 8))

    act(() => result.current.goToPreviousPage())

    expect(result.current.page).toBe(1)
  })

  it('se ajusta automaticamente cuando la lista se reduce y la pagina actual queda fuera de rango', () => {
    let items = Array.from({ length: 20 }, (_, i) => i)
    const { result, rerender } = renderHook(({ items }) => usePagination(items, 8), {
      initialProps: { items },
    })

    act(() => result.current.goToNextPage())
    act(() => result.current.goToNextPage())
    expect(result.current.page).toBe(3)

    items = items.slice(0, 5)
    rerender({ items })

    expect(result.current.page).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.paginatedItems).toEqual(items)
  })
})
