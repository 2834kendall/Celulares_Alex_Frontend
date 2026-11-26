import { describe, expect, it } from 'vitest'
import { primaryFace } from './primaryFace'

function box(x: number, y: number, width: number, height: number) {
  return [
    { x, y },
    { x: x + width, y: y + height },
  ]
}

describe('primaryFace', () => {
  it('chooses the largest face even when the smaller face is centered', () => {
    const large = box(0, 0, 0.5, 0.5)
    const small = box(0.375, 0.375, 0.25, 0.25)
    expect(primaryFace([small, large], 640, 480)).toEqual({ landmarks: large, crowded: false })
  })

  it('breaks an area tie by proximity to the center in video pixels', () => {
    const horizontallyOffset = box(0.125, 0.375, 0.25, 0.25)
    const verticallyOffset = box(0.375, 0.125, 0.25, 0.25)
    expect(primaryFace([horizontallyOffset, verticallyOffset], 640, 480)).toEqual({
      landmarks: verticallyOffset,
      crowded: true,
    })
  })

  it.each([
    [0.8, true],
    [0.5, false],
  ])('sets crowded at a second-face area of %s', (ratio, crowded) => {
    const large = box(0, 0, 1, 1)
    const small = box(0, 0, ratio, 1)
    expect(primaryFace([large, small], 640, 480)).toEqual({ landmarks: large, crowded })
  })

  it('returns no landmarks when no face was detected', () => {
    expect(primaryFace([], 640, 480)).toEqual({ landmarks: null, crowded: false })
  })
})
