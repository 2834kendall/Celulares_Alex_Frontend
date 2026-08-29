import { describe, expect, it } from 'vitest'
import { eyeTiltAngle, faceCropBox, firstFaceLandmarks } from './landmarks'

/** Arma un arreglo de landmarks con solo los ojos en los indices que usa eyeTiltAngle. */
function withEyes(right: { x: number; y: number }, left: { x: number; y: number }) {
  const landmarks: { x: number; y: number }[] = []
  landmarks[33] = right
  landmarks[263] = left
  return landmarks
}

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

describe('eyeTiltAngle', () => {
  it('devuelve ~0 con los ojos nivelados', () => {
    const landmarks = withEyes({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 })
    expect(eyeTiltAngle(landmarks, 1000, 1000)).toBeCloseTo(0)
  })

  it('detecta la cabeza inclinada (ojo izquierdo mas abajo)', () => {
    const landmarks = withEyes({ x: 0.3, y: 0.4 }, { x: 0.7, y: 0.6 })
    const angle = eyeTiltAngle(landmarks, 1000, 1000)
    expect(angle).not.toBeNull()
    expect(angle!).toBeGreaterThan(0)
  })

  it('pondera el ancho y el alto del frame por separado (no cuadrado)', () => {
    // Mismo delta normalizado en x e y, pero frame 1000x500: en pixeles el
    // delta horizontal pesa el doble, asi que el angulo no deberia ser 45°.
    const landmarks = withEyes({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 })
    const angle = eyeTiltAngle(landmarks, 1000, 500)
    expect(angle).not.toBeNull()
    expect(Math.abs(angle!)).toBeLessThan(Math.PI / 4)
  })

  it('devuelve null si faltan los landmarks de los ojos', () => {
    expect(eyeTiltAngle([{ x: 0.5, y: 0.5 }], 1000, 1000)).toBeNull()
  })

  it('devuelve null con dimensiones de frame invalidas', () => {
    const landmarks = withEyes({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 })
    expect(eyeTiltAngle(landmarks, 0, 1000)).toBeNull()
  })
})

describe('firstFaceLandmarks', () => {
  it('devuelve los landmarks del primer rostro', () => {
    const result = {
      faceLandmarks: [[{ x: 0.1, y: 0.2 }]],
    }
    expect(firstFaceLandmarks(result)).toEqual([{ x: 0.1, y: 0.2 }])
  })

  it('devuelve null sin rostros', () => {
    expect(firstFaceLandmarks({ faceLandmarks: [] })).toBeNull()
  })
})
