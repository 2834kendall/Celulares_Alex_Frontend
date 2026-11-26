import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

describe('useWakeLock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps the display awake, requests again on return and releases on unmount', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const first = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    const second = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const { unmount } = renderHook(useWakeLock)
    await act(async () => {})
    expect(request).toHaveBeenCalledWith('screen')

    visibility.mockReturnValue('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(first.release).toHaveBeenCalledOnce()
    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(2)

    unmount()
    expect(second.release).toHaveBeenCalledOnce()
  })

  it('releases a lock that arrives after unmount', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const lock = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    let finish!: (value: typeof lock) => void
    const request = vi.fn(
      () =>
        new Promise<typeof lock>((resolve) => {
          finish = resolve
        })
    )
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const { unmount } = renderHook(useWakeLock)
    unmount()
    await act(async () => {
      finish(lock)
    })
    expect(lock.release).toHaveBeenCalledOnce()
  })

  it('retries a pending request interrupted by a visibility change', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let reject!: (error: Error) => void
    const lock = { released: false, release: vi.fn().mockResolvedValue(undefined) }
    const request = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((_resolve, fail) => {
          reject = fail
        })
      )
      .mockResolvedValueOnce(lock)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const { unmount } = renderHook(useWakeLock)
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {
      reject(new Error('Page was hidden'))
    })
    expect(request).toHaveBeenCalledTimes(2)
    unmount()
    expect(lock.release).toHaveBeenCalledOnce()
  })

  it('works without browser support or permission', async () => {
    vi.stubGlobal('navigator', {})
    const unsupported = renderHook(useWakeLock)
    unsupported.unmount()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const request = vi.fn().mockRejectedValue(new Error('Disabled'))
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const denied = renderHook(useWakeLock)
    await act(async () => {})
    expect(request).toHaveBeenCalledOnce()
    denied.unmount()
  })
})
