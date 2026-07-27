import { describe, expect, it } from 'vitest'
import { extractBlinkScores, faceCropBox, firstFaceLandmarks } from './landmarks'

describe('extractBlinkScores', () => {
  it('extrae los scores de parpadeo del primer rostro', () => {
    const result = {
      faceLandmarks: [[{ x: 0.5, y: 0.5 }]],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: 'browDownLeft', score: 0.1 },
            { categoryName: 'eyeBlinkLeft', score: 0.7 },
            { categoryName: 'eyeBlinkRight', score: 0.65 },
          ],
        },
      ],
    }

    expect(extractBlinkScores(result)).toEqual({ blinkLeft: 0.7, blinkRight: 0.65 })
  })

  it('devuelve null sin blendshapes (rostro no detectado)', () => {
    expect(extractBlinkScores({ faceLandmarks: [], faceBlendshapes: [] })).toBeNull()
  })

  it('devuelve null si faltan las categorias de parpadeo', () => {
    const result = {
      faceLandmarks: [],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.2 }] }],
    }
    expect(extractBlinkScores(result)).toBeNull()
  })
})

describe('faceCropBox', () => {
  it('produce una caja cuadrada con margen alrededor del rostro', () => {
    // Rostro en el centro: x 0.4-0.6, y 0.3-0.7 de un frame 1000x1000.
    const landmarks = [
      { x: 0.4, y: 0.3 },
      { x: 0.6, y: 0.7 },
    ]

    const box = faceCropBox(landmarks, 1000, 1000, 0.25)

    expect(box).not.toBeNull()
    // Lado = max(200, 400) * 1.5 = 600, centrado en (500, 500).
    expect(box!.size).toBeCloseTo(600)
    expect(box!.x).toBeCloseTo(200)
    expect(box!.y).toBeCloseTo(200)
  })

  it('recorta la caja a los bordes del frame', () => {
    // Rostro pegado a la esquina superior izquierda.
    const landmarks = [
      { x: 0.0, y: 0.0 },
      { x: 0.3, y: 0.3 },
    ]

    const box = faceCropBox(landmarks, 1000, 1000, 0.25)

    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.size).toBeLessThanOrEqual(1000)
    expect(box!.y + box!.size).toBeLessThanOrEqual(1000)
  })

  it('nunca excede el lado menor del frame', () => {
    const landmarks = [
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.95 },
    ]

    const box = faceCropBox(landmarks, 640, 480, 0.25)

    expect(box).not.toBeNull()
    expect(box!.size).toBeLessThanOrEqual(480)
  })

  it('devuelve null sin landmarks o con dimensiones invalidas', () => {
    expect(faceCropBox([], 640, 480)).toBeNull()
    expect(faceCropBox([{ x: 0.5, y: 0.5 }], 0, 480)).toBeNull()
  })
})

describe('firstFaceLandmarks', () => {
  it('devuelve los landmarks del primer rostro', () => {
    const result = {
      faceLandmarks: [[{ x: 0.1, y: 0.2 }]],
      faceBlendshapes: [],
    }
    expect(firstFaceLandmarks(result)).toEqual([{ x: 0.1, y: 0.2 }])
  })

  it('devuelve null sin rostros', () => {
    expect(firstFaceLandmarks({ faceLandmarks: [], faceBlendshapes: [] })).toBeNull()
  })
})
