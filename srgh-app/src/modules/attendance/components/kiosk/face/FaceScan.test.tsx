import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FaceScan } from './FaceScan'

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  discardDetector: vi.fn(),
  score: vi.fn(),
  embed: vi.fn(),
  encrypt: vi.fn(),
  stop: vi.fn(),
  hands: vi.fn(),
  getHands: vi.fn(),
  covered: false,
  qualityOk: true,
  dark: false,
  faces: 1,
}))
vi.mock('./faceLandmarker', () => ({
  discardFaceLandmarker: mocks.discardDetector,
  getFaceLandmarker: async () => ({
    detectForVideo: (...args: unknown[]) => {
      const points = mocks.detect(...args)
      return {
        faceLandmarks: !points
          ? []
          : Array.isArray(points[0])
            ? points
            : Array(mocks.faces).fill(points),
      }
    },
  }),
}))
vi.mock('./handLandmarker', () => ({
  getHandLandmarker: () => mocks.getHands(),
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
  firstFaceLandmarks: (r: { faceLandmarks: unknown[] }) => r.faceLandmarks[0] ?? null,
  faceCropBox: () => ({ x: 0, y: 0, size: 150 }),
  eyeTiltAngle: () => 0,
}))
vi.mock('./quality', () => ({
  assessQuality: () => ({ ok: mocks.qualityOk, issues: [] }),
  qualityMessage: () => 'Acercate un poco más a la cámara',
  assessPixels: () => ({ ok: true, sharpness: 100, light: 120 }),
  handCoversFace: () => mocks.covered,
  eyeShade: () => ({ right: 0.5, left: 0.5 }),
  looksLikeDarkGlasses: () => mocks.dark,
  DARK_GLASSES_MESSAGE: 'Quitate los lentes oscuros',
  ovalInVideo: () => null,
  HAND_ON_FACE_MESSAGE: 'Quita la mano de la cara',
}))
vi.mock('@/modules/attendance/lib/face/faceCrypto', () => ({ encryptFacePayload: mocks.encrypt }))

describe('FaceScan continuity', () => {
  let raf: FrameRequestCallback[]
  let videoTime: number
  let clock: number
  async function frame(advance = true, elapsedMs = 100) {
    if (advance) videoTime += 0.1
    clock += elapsedMs
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
    mocks.detect.mockReturnValue([
      { x: 0.375, y: 0.375 },
      { x: 0.625, y: 0.625 },
    ])
    mocks.discardDetector.mockResolvedValue(undefined)
    mocks.score.mockResolvedValue(0.99)
    mocks.embed.mockResolvedValue(Array(128).fill(0))
    mocks.encrypt.mockResolvedValue({ iv: 'iv', data: 'ciphertext' })
    mocks.covered = false
    mocks.qualityOk = true
    mocks.dark = false
    mocks.faces = 1
    mocks.hands.mockReturnValue({ landmarks: [[{ x: 0.5, y: 0.5 }]] })
    mocks.getHands.mockResolvedValue({ detectForVideo: mocks.hands })
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

  it('reports missing camera support without starting recognition', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const onUnavailable = vi.fn()
    const onEmbedding = vi.fn()
    render(<FaceScan onEmbedding={onEmbedding} onUnavailable={onUnavailable} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    expect(onUnavailable).toHaveBeenCalledWith('Este dispositivo no tiene cámara disponible.')
    expect(mocks.detect).not.toHaveBeenCalled()
    expect(onEmbedding).not.toHaveBeenCalled()
  })

  it('handles camera permission denial without emitting a facial payload', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError')
    )
    const onUnavailable = vi.fn()
    const onEmbedding = vi.fn()
    render(<FaceScan onEmbedding={onEmbedding} onUnavailable={onUnavailable} />)
    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledWith('No se pudo acceder a la cámara.')
    )
    expect(onEmbedding).not.toHaveBeenCalled()
    expect(mocks.detect).not.toHaveBeenCalled()
  })

  it('stops the camera if frame detection throws', async () => {
    const { onUnavailable, onEmbedding } = await mount()
    mocks.detect.mockImplementationOnce(() => {
      throw new Error('runtime failure')
    })
    await frame()
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(mocks.discardDetector).toHaveBeenCalledWith(2)
    expect(mocks.discardDetector).toHaveBeenCalledBefore(onUnavailable)
    expect(mocks.stop).toHaveBeenCalled()
    expect(onEmbedding).not.toHaveBeenCalled()
  })

  it('reports encryption failure without publishing unencrypted biometrics', async () => {
    mocks.encrypt.mockRejectedValueOnce(new Error('encryption failure'))
    const { onUnavailable, onEmbedding } = await mount()
    for (let i = 0; i < 24; i++) await frame()
    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledWith('No se pudo procesar el rostro capturado.')
    )
    expect(onEmbedding).not.toHaveBeenCalled()
    expect(mocks.stop).toHaveBeenCalled()
  })

  it('can wait idle without timing out before anybody approaches', async () => {
    mocks.detect.mockReturnValue(null)
    const { onUnavailable } = await mount()
    for (let i = 0; i < 90; i++) await frame()
    expect(onUnavailable).not.toHaveBeenCalled()
  })

  it('uses the wall-clock deadline even when the video stalls during a kiosk scan', async () => {
    const { onUnavailable, onEmbedding } = await mount()
    await frame()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1)
    await frame(false, 8100)
    expect(onUnavailable).toHaveBeenCalledOnce()
    expect(onEmbedding).not.toHaveBeenCalled()
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
    expect(onEmbedding).toHaveBeenCalledWith(
      { iv: 'iv', data: 'ciphertext' },
      {
        scanMs: expect.any(Number),
        fps: expect.any(Number),
      }
    )
    const [, metrics] = onEmbedding.mock.calls[0]
    expect(metrics.scanMs).toBeGreaterThan(0)
    expect(metrics.fps).toBeGreaterThan(0)
    expect(mocks.stop).toHaveBeenCalled()
  })

  it('uses three independent captures during enrollment', async () => {
    const { onEmbedding } = await mount(true)
    for (let i = 0; i < 24; i++) await frame()
    expect(mocks.embed).toHaveBeenCalledTimes(3)
    expect(onEmbedding).toHaveBeenCalledTimes(1)
    expect(onEmbedding).toHaveBeenCalledWith({ iv: 'iv', data: 'ciphertext' })
  })
  it('does not enroll while a hand covers the face, and resumes once it moves', async () => {
    mocks.covered = true
    const { onEmbedding, findByText, getByTestId } = await mount(true)
    for (let i = 0; i < 30; i++) await frame()
    expect(onEmbedding).not.toHaveBeenCalled()
    expect(mocks.embed).not.toHaveBeenCalled()
    expect(await findByText('Quita la mano de la cara')).toBeInTheDocument()
    expect(getByTestId('scan-ring')).toHaveAttribute('data-tone', 'warn')
    expect(getByTestId('scan-ring')).toHaveAttribute('data-progress', '0.00')

    mocks.covered = false
    for (let i = 0; i < 30; i++) await frame()
    expect(mocks.embed).toHaveBeenCalledTimes(3)
    expect(onEmbedding).toHaveBeenCalledTimes(1)
  })
  it('fails closed when the hand detector cannot load during enrollment', async () => {
    mocks.getHands.mockRejectedValue(new Error('no model'))
    const onUnavailable = vi.fn()
    render(<FaceScan enrollment onEmbedding={vi.fn()} onUnavailable={onUnavailable} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    expect(mocks.stop).toHaveBeenCalled()
  })
  it('the kiosk never loads the hand detector', async () => {
    const { onEmbedding } = await mount()
    for (let i = 0; i < 24; i++) await frame()
    expect(onEmbedding).toHaveBeenCalledTimes(1)
    expect(mocks.getHands).not.toHaveBeenCalled()
  })
  it('fills the ring while the person holds still and turns green at the end', async () => {
    const { getByTestId, findByText } = await mount(true)
    const ring = getByTestId('scan-ring')
    await frame()
    expect(await findByText('Quedate quieto, mirando a la cámara')).toBeInTheDocument()
    let previous = 0
    for (let i = 0; i < 12; i++) {
      await frame()
      const progress = Number(ring.getAttribute('data-progress'))
      expect(progress).toBeGreaterThanOrEqual(previous)
      previous = progress
    }
    expect(previous).toBeGreaterThan(0)
    for (let i = 0; i < 20; i++) await frame()
    expect(ring).toHaveAttribute('data-tone', 'done')
    expect(ring).toHaveAttribute('data-progress', '1.00')
    expect(await findByText('Listo, ya podés moverte')).toBeInTheDocument()
  })
  it('does not flash a message that only lasts one frame', async () => {
    const { findByText, queryByText } = await mount(true)
    await frame()
    await findByText('Quedate quieto, mirando a la cámara')
    mocks.covered = true
    await frame()
    mocks.covered = false
    await frame()
    await new Promise((r) => setTimeout(r, 500))
    expect(queryByText('Quita la mano de la cara')).not.toBeInTheDocument()
  })
  it('names the probable cause when it times out', async () => {
    mocks.qualityOk = false
    const { onUnavailable } = await mount()
    for (let i = 0; i < 90; i++) await frame()
    expect(onUnavailable).toHaveBeenCalledWith(
      'No pudimos completar la captura. Acercate un poco más a la cámara e intentá de nuevo.'
    )
  })
  it('shows the loading skeleton until the camera answers, then the live guidance', async () => {
    let answer!: (stream: unknown) => void
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => new Promise((resolve) => (answer = resolve))) },
    })
    const { getByRole, queryByRole, findByText } = render(
      <FaceScan enrollment onEmbedding={vi.fn()} onUnavailable={vi.fn()} />
    )
    expect(getByRole('status')).toHaveTextContent('Preparando la cámara…')
    await act(async () => answer({ getTracks: () => [{ stop: mocks.stop }] }))
    await waitFor(() => expect(queryByRole('status')).not.toBeInTheDocument())
    expect(await findByText('Preparando el reconocimiento…')).toBeInTheDocument()
  })
  it('does not enroll with dark glasses on, and resumes once they come off', async () => {
    mocks.dark = true
    const { onEmbedding, findByText } = await mount(true)
    for (let i = 0; i < 30; i++) await frame()
    expect(onEmbedding).not.toHaveBeenCalled()
    expect(await findByText('Quitate los lentes oscuros')).toBeInTheDocument()

    mocks.dark = false
    for (let i = 0; i < 30; i++) await frame()
    expect(onEmbedding).toHaveBeenCalledTimes(1)
  })
  it('dark glasses do not prevent an otherwise valid kiosk capture', async () => {
    mocks.dark = true
    const { onEmbedding } = await mount()
    for (let i = 0; i < 24; i++) await frame()
    expect(onEmbedding).toHaveBeenCalledTimes(1)
  })

  it('suggests removing sunglasses if dark readings persist until the timeout', async () => {
    mocks.dark = true
    mocks.score.mockResolvedValue(null)
    const { onUnavailable, getByText } = await mount()
    expect(getByText('De frente, sin nada en la cara')).toBeInTheDocument()
    for (let i = 0; i < 85; i++) await frame()
    expect(onUnavailable).toHaveBeenCalledWith(
      expect.stringContaining('Si usás lentes de sol, quitátelos e intentá de nuevo.')
    )
  })

  it('preserves scan progress and holds capture for one second when a second person approaches', async () => {
    const face = [
      { x: 0.375, y: 0.375 },
      { x: 0.625, y: 0.625 },
    ]
    const otherFace = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
    ]
    const { onEmbedding, findByText } = await mount()
    for (let i = 0; i < 18; i++) await frame()
    mocks.detect.mockReturnValue([face, otherFace])
    for (let i = 0; i < 8; i++) await frame()
    expect(await findByText('Una persona a la vez')).toBeInTheDocument()
    expect(mocks.embed).not.toHaveBeenCalled()
    for (let i = 0; i < 6; i++) await frame()
    expect(onEmbedding).toHaveBeenCalledOnce()
  })

  it('skips decoded frames after warmup on slow devices without skipping all liveness samples', async () => {
    const { onEmbedding } = await mount()
    for (let i = 0; i < 28; i++) await frame(true, 250)
    expect(mocks.detect.mock.calls.length).toBeLessThan(20)
    expect(onEmbedding).toHaveBeenCalledOnce()
  })
  it('does not enroll with two people in frame', async () => {
    mocks.faces = 2
    const { onEmbedding, findByText } = await mount(true)
    for (let i = 0; i < 30; i++) await frame()
    expect(onEmbedding).not.toHaveBeenCalled()
    expect(await findByText('Que solo una persona quede frente a la cámara')).toBeInTheDocument()
  })
  it('tells the person to hold still when the three captures disagree', async () => {
    const far = Array(128).fill(0)
    far[0] = 1
    mocks.embed
      .mockResolvedValueOnce(Array(128).fill(0))
      .mockResolvedValueOnce(Array(128).fill(0))
      .mockResolvedValueOnce(far)
    const { onEmbedding, onUnavailable } = await mount(true)
    for (let i = 0; i < 30; i++) await frame()
    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledWith(
        'Las tomas salieron distintas entre sí. Quedate quieto, de frente, e intentá de nuevo.'
      )
    )
    expect(onEmbedding).not.toHaveBeenCalled()
  })
  it('asks for the camera without waiting for the models', async () => {
    let releaseModels!: () => void
    mocks.getHands.mockReturnValue(
      new Promise((resolve) => {
        releaseModels = () => resolve({ detectForVideo: mocks.hands })
      })
    )
    render(<FaceScan enrollment onEmbedding={vi.fn()} onUnavailable={vi.fn()} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1))
    releaseModels()
  })
  it('releases the camera on unmount without publishing late results', async () => {
    const { unmount, onEmbedding } = await mount()
    unmount()
    await frame()
    expect(mocks.stop).toHaveBeenCalled()
    expect(onEmbedding).not.toHaveBeenCalled()
  })
})
