import { describe, expect, it } from 'vitest'
import { classifyDistance, euclideanDistance, l2Normalize } from './faceMath'

describe('l2Normalize', () => {
  it('deja el vector con norma 1', () => {
    const v = l2Normalize([3, 4])
    expect(v[0]).toBeCloseTo(0.6)
    expect(v[1]).toBeCloseTo(0.8)
  })

  it('no divide por cero con el vector nulo', () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0])
  })
})

describe('euclideanDistance', () => {
  it('es 0 para vectores identicos', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0)
  })

  it('mide la distancia real (3-4-5)', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5)
  })

  it('NO es invariante a escala (a diferencia del coseno): la magnitud importa', () => {
    // Vectores paralelos de distinta magnitud NO estan a distancia 0 — esta
    // es exactamente la propiedad que hacia inservible al coseno con los
    // descriptores de dlib.
    expect(euclideanDistance([1, 2, 3], [2, 4, 6])).toBeGreaterThan(0)
  })

  it('lanza si los largos no calzan (modelos distintos)', () => {
    expect(() => euclideanDistance([1, 2], [1, 2, 3])).toThrow()
  })

  it('lanza con vectores vacios', () => {
    expect(() => euclideanDistance([], [])).toThrow()
  })
})

describe('classifyDistance (umbrales euclideos, referencia dlib 0.6)', () => {
  it('< 0.4 es MATCH de alta confianza', () => {
    expect(classifyDistance(0.1)).toEqual({ status: 'MATCH', confianza: 'alta' })
    expect(classifyDistance(0.39)).toEqual({ status: 'MATCH', confianza: 'alta' })
  })

  it('0.4 a 0.5 es MATCH con tolerancia (luz/angulo)', () => {
    expect(classifyDistance(0.4)).toEqual({ status: 'MATCH', confianza: 'tolerancia' })
    expect(classifyDistance(0.49)).toEqual({ status: 'MATCH', confianza: 'tolerancia' })
  })

  it('0.5 a 0.6 es REQUIRE_PIN (zona de incertidumbre)', () => {
    expect(classifyDistance(0.5).status).toBe('REQUIRE_PIN')
    expect(classifyDistance(0.6).status).toBe('REQUIRE_PIN')
  })

  it('> 0.6 es DENIED (persona diferente segun el umbral canonico de dlib)', () => {
    expect(classifyDistance(0.61).status).toBe('DENIED')
    expect(classifyDistance(1.5).status).toBe('DENIED')
  })
})
