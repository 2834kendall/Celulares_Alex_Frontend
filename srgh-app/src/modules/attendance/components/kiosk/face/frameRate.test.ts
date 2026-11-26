import { describe, expect, it } from 'vitest'
import { analysisStride, createFrameRateMeter } from './frameRate'

describe('frame rate', () => {
  it('measures the recent window and forgets earlier rates', () => {
    const meter = createFrameRateMeter()
    expect(meter.record(0)).toBe(0)
    for (let ms = 50; ms < 1500; ms += 50) meter.record(ms)
    expect(meter.record(1500)).toBe(20)
    expect(meter.record(1500)).toBe(20)
    for (let ms = 1750; ms < 3000; ms += 250) meter.record(ms)
    expect(meter.record(3000)).toBe(4)
    expect(meter.record(5000)).toBe(0)
  })

  it.each([
    [30, 1],
    [12, 1],
    [11.9, 2],
    [6, 2],
    [5.9, 3],
    [0, 3],
  ])('uses stride %s FPS → %s', (fps, stride) => expect(analysisStride(fps)).toBe(stride))
})
