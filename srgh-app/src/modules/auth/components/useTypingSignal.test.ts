import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTypingSignal } from './useTypingSignal'

describe('useTypingSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('se enciende con cada tecla y se apaga 700 ms despues de la ultima', () => {
    const { result } = renderHook(() => useTypingSignal())
    expect(result.current[0]).toBe(false)

    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)

    act(() => vi.advanceTimersByTime(699))
    expect(result.current[0]).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current[0]).toBe(false)
  })

  it('cada tecla vuelve a empezar la espera', () => {
    const { result } = renderHook(() => useTypingSignal())

    act(() => result.current[1]())
    act(() => vi.advanceTimersByTime(500))
    act(() => result.current[1]())
    act(() => vi.advanceTimersByTime(500))
    // 1000 ms desde la primera tecla, pero solo 500 desde la ultima.
    expect(result.current[0]).toBe(true)

    act(() => vi.advanceTimersByTime(200))
    expect(result.current[0]).toBe(false)
  })

  it('al desmontar no deja el temporizador pendiente', () => {
    const { result, unmount } = renderHook(() => useTypingSignal())

    act(() => result.current[1]())
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
