import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FaceScan } from './FaceScan'

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  score: vi.fn(),
  embed: vi.fn(),
  encrypt: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('./faceLandmarker', () => ({
  getFaceLandmarker: async () => ({ detectForVideo: mocks.detect }),
}))
vi.mock('./embedding', () => ({
  preloadEmbeddingModel: async () => {},
  computeEmbedding: mocks.embed,
}))
vi.mock('./antispoof', () => ({
  preloadAntispoofModel: async () => {},
  scoreRealness: mocks.score,
}))
vi.mock('./landmarks', () => ({
  firstFaceLandmarks: (r: unknown) => r,
  faceCropBox: () => ({ x: 0, y: 0, size: 150 }),
  eyeTiltAngle: () => 0,
}))
vi.mock('./quality', () => ({
  assessQuality: () => ({ ok: true }),
  qualityMessage: () => null,
  assessPixels: () => ({ ok: true, sharpness: 100, light: 120 }),
}))
vi.mock('@/modules/attendance/lib/face/faceCrypto', () => ({ encryptFacePayload: mocks.encrypt }))

describe('FaceScan continuity', () => {
  let raf: FrameRequestCallback[]
  let videoTime: number
  let clock: number
  async function frame(advance = true) {
    if (advance) videoTime += 0.1
    clock += 100
    await act(async () => {
      raf.shift()?.(clock)
    })
  }
  async function mount(enrollment = false) {
    const onEmbedding = vi.fn().mockResolvedValue(undefined)
    const onUnavailable = vi.fn()
    const view = render(
      <FaceScan enrollment={enrollment} onEmbedding={onEmbedding} onUnavailable={onUnavailable} />
    )
    await waitFor(() => expect(raf.length).toBeGreaterThan(0))
    return { ...view, onEmbedding, onUnavailable }
  }
  beforeEach(() => {
    vi.clearAllMocks()
    raf = []
    videoTime = 0
    clock = 0
    vi.stubEnv('NEXT_PUBLIC_FACE_VECTOR_KEY', 'configured')
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf.push(cb)
      return raf.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2)
    vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => videoTime)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      getImageData: () => ({}),
    } as never)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: mocks.stop }] }),
      },
    })
    mocks.detect.mockReturnValue([{ x: 0.5, y: 0.5 }])
    mocks.score.mockResolvedValue(0.99)
    mocks.embed.mockResolvedValue(Array(128).fill(0))
    mocks.encrypt.mockResolvedValue({ iv: 'iv', data: 'ciphertext' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not run detection twice for the same decoded frame', async () => {
    await mount()
    await frame()
    await frame(false)
    expect(mocks.detect).toHaveBeenCalledTimes(1)
    await frame()
    expect(mocks.detect).toHaveBeenCalledTimes(2)
  })

  it('can wait idle without timing out before anybody approaches', async () => {
    mocks.detect.mockReturnValue(null)
    const { onUnavailable } = await mount()
    for (let i = 0; i < 90; i++) await frame()
    expect(onUnavailable).not.toHaveBeenCalled()
  })
  it('discards an antispoof result that arrives after the face is lost', async () => {
    let finish: (n: number) => void = () => {}
    mocks.score.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve
        })
    )
    const { onEmbedding } = await mount()
    for (let i = 0; i < 3; i++) await frame()
    mocks.detect.mockReturnValueOnce(null)
    await frame()
    await act(async () => finish(0.99))
    for (let i = 0; i < 13; i++) await frame()
    // Only four fresh scores: the pre-interruption score must not approve capture.
    expect(mocks.embed).not.toHaveBeenCalled()
    expect(onEmbedding).not.toHaveBeenCalled()
  })
  it('drops an approved capture if the face leaves before its capture window ends', async () => {
    await mount()
    for (let i = 0; i < 16; i++) await frame()
    mocks.detect.mockReturnValueOnce(null)
    await frame()
    for (let i = 0; i < 8; i++) await frame()
    expect(mocks.embed).not.toHaveBeenCalled()
  })
  it('finishes one capture, stops the camera and calls the parent once', async () => {
    const { onEmbedding } = await mount()
    for (let i = 0; i < 24; i++) await frame()
    expect(mocks.embed).toHaveBeenCalledTimes(1)
    expect(onEmbedding).toHaveBeenCalledTimes(1)
    expect(mocks.stop).toHaveBeenCalled()
  })

  it('uses three independent captures during enrollment', async () => {
    const { onEmbedding } = await mount(true)
    for (let i = 0; i < 24; i++) await frame()
    expect(mocks.embed).toHaveBeenCalledTimes(3)
    expect(onEmbedding).toHaveBeenCalledTimes(1)
  })
  it('releases the camera on unmount without publishing late results', async () => {
    const { unmount, onEmbedding } = await mount()
    unmount()
    await frame()
    expect(mocks.stop).toHaveBeenCalled()
    expect(onEmbedding).not.toHaveBeenCalled()
  })
})
