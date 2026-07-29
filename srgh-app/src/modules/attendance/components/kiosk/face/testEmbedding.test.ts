import { describe, expect, it } from 'vitest'
import { computeTestEmbedding } from './testEmbedding'
import { cosineDistance } from '@/modules/attendance/lib/face/faceMath'
import { FACE_EMBEDDING_DIM, FACE_INPUT_SIZE } from '@/modules/attendance/lib/face/model'

function solidFrame(value: number, size = FACE_INPUT_SIZE): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = value
    rgba[i + 1] = value
    rgba[i + 2] = value
    rgba[i + 3] = 255
  }
  return rgba
}

describe('computeTestEmbedding', () => {
  it('produce un vector de 128 dimensiones (FACE_EMBEDDING_DIM)', () => {
    const vector = computeTestEmbedding(solidFrame(128))
    expect(vector).toHaveLength(FACE_EMBEDDING_DIM)
  })

  it('es determinista: la misma imagen produce el mismo vector', () => {
    const a = computeTestEmbedding(solidFrame(90))
    const b = computeTestEmbedding(solidFrame(90))
    expect(a).toEqual(b)
  })

  it('imagenes identicas (misma "cara") quedan a distancia 0', () => {
    const a = computeTestEmbedding(solidFrame(140))
    const b = computeTestEmbedding(solidFrame(140))
    expect(cosineDistance(a, b)).toBeCloseTo(0)
  })

  it('imagenes bien distintas quedan mas lejos que casi identicas', () => {
    const base = solidFrame(100)
    const almostSame = solidFrame(105)
    const veryDifferent = solidFrame(220)

    const vBase = computeTestEmbedding(base)
    const vAlmostSame = computeTestEmbedding(almostSame)
    const vVeryDifferent = computeTestEmbedding(veryDifferent)

    const distSame = cosineDistance(vBase, vAlmostSame)
    const distDifferent = cosineDistance(vBase, vVeryDifferent)

    expect(distDifferent).toBeGreaterThan(distSame)
  })

  it('lanza si el buffer no corresponde al tamaño esperado', () => {
    expect(() => computeTestEmbedding(new Uint8ClampedArray(10), FACE_INPUT_SIZE)).toThrow(
      /Recorte facial/
    )
  })

  it('distingue patrones distintos aunque el brillo promedio sea igual', () => {
    // Mitad clara / mitad oscura vs. uniforme del mismo promedio: el vector
    // por grilla debe notar la diferencia de patron, no solo el promedio.
    const size = FACE_INPUT_SIZE
    const half = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const value = x < size / 2 ? 0 : 255
        half[i] = value
        half[i + 1] = value
        half[i + 2] = value
        half[i + 3] = 255
      }
    }
    const uniform = solidFrame(127.5, size)

    const vHalf = computeTestEmbedding(half)
    const vUniform = computeTestEmbedding(uniform)

    expect(cosineDistance(vHalf, vUniform)).toBeGreaterThan(0.05)
  })
})
