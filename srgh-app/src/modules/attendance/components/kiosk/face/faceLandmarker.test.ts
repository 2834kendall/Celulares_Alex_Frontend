import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create, resolveFiles } = vi.hoisted(() => ({
  create: vi.fn(),
  resolveFiles: vi.fn(),
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: { createFromOptions: create },
  FilesetResolver: { forVisionTasks: resolveFiles },
}))

describe('face landmarker device compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    create.mockReset()
    resolveFiles.mockReset().mockResolvedValue({ wasmLoaderPath: '/local-wasm' })
  })

  it('shares one GPU detector across concurrent loads', async () => {
    const detector = { detectForVideo: vi.fn() }
    create.mockResolvedValue(detector)
    const { getFaceLandmarker } = await import('./faceLandmarker')
    const results = await Promise.all([getFaceLandmarker(), getFaceLandmarker()])
    expect(results).toEqual([detector, detector])
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][1].baseOptions.delegate).toBe('GPU')
  })

  it('uses and caches the CPU detector when GPU initialization is unavailable', async () => {
    const detector = { detectForVideo: vi.fn() }
    create.mockRejectedValueOnce(new Error('WebGL unavailable')).mockResolvedValueOnce(detector)
    const { getFaceLandmarker } = await import('./faceLandmarker')
    expect(await getFaceLandmarker()).toBe(detector)
    expect(await getFaceLandmarker()).toBe(detector)
    expect(create).toHaveBeenCalledTimes(2)
    const [gpu, cpu] = create.mock.calls.map((call) => call[1])
    expect(gpu.baseOptions.delegate).toBe('GPU')
    expect(cpu).toEqual({ ...gpu, baseOptions: { ...gpu.baseOptions, delegate: 'CPU' } })
  })

  it('rejects if both delegates fail and allows a later fresh attempt', async () => {
    create
      .mockRejectedValueOnce(new Error('GPU unavailable'))
      .mockRejectedValueOnce(new Error('CPU unavailable'))
    const { getFaceLandmarker } = await import('./faceLandmarker')
    await expect(getFaceLandmarker()).rejects.toThrow('CPU unavailable')
    const detector = { detectForVideo: vi.fn() }
    create.mockResolvedValueOnce(detector)
    expect(await getFaceLandmarker()).toBe(detector)
    expect(resolveFiles).toHaveBeenCalledTimes(2)
  })
})
