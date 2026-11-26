import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('confirmation cue', () => {
  it('plays a low-volume tone for about 120 ms and vibrates after success', async () => {
    const oscillator = {
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    }
    const volume = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    const vibrate = vi.fn()
    const audio = {
      state: 'running',
      currentTime: 1,
      destination: {},
      createOscillator: () => oscillator,
      createGain: () => volume,
    }
    vi.stubGlobal('AudioContext', function () {
      return audio
    })
    vi.stubGlobal('navigator', { vibrate })
    const { prepareConfirmationCue, playConfirmationCue } = await import('./confirmationCue')
    prepareConfirmationCue()
    expect(oscillator.start).not.toHaveBeenCalled()
    expect(vibrate).not.toHaveBeenCalled()
    playConfirmationCue()

    expect(vibrate).toHaveBeenCalledWith(80)
    expect(volume.gain.setValueAtTime).toHaveBeenCalledWith(0.05, 1)
    expect(oscillator.start).toHaveBeenCalledWith(1)
    expect(oscillator.stop).toHaveBeenCalledWith(1.12)
    oscillator.onended?.()
    expect(oscillator.disconnect).toHaveBeenCalledOnce()
  })

  it('degrades silently when the browser provides neither API', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('navigator', {})
    const { prepareConfirmationCue, playConfirmationCue } = await import('./confirmationCue')
    expect(prepareConfirmationCue).not.toThrow()
    expect(playConfirmationCue).not.toThrow()
  })
})
