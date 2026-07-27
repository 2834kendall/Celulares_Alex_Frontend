import { describe, expect, it } from 'vitest'
import { classifyDistance, cosineDistance, l2Normalize } from './faceMath'

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

describe('cosineDistance', () => {
  it('es 0 para vectores identicos', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0)
  })

  it('es 0 para vectores paralelos de distinta magnitud (invariante a escala)', () => {
    expect(cosineDistance([1, 2, 3], [2, 4, 6])).toBeCloseTo(0)
  })

  it('es 1 para vectores ortogonales', () => {
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1)
  })

  it('es 2 para vectores opuestos', () => {
    expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2)
  })

  it('lanza si los largos no calzan (modelos distintos)', () => {
    expect(() => cosineDistance([1, 2], [1, 2, 3])).toThrow()
  })

  it('lanza con vectores vacios', () => {
    expect(() => cosineDistance([], [])).toThrow()
  })
})

describe('classifyDistance (umbrales exactos del diseño)', () => {
  it('< 0.3 es MATCH de alta confianza', () => {
    expect(classifyDistance(0.1)).toEqual({ status: 'MATCH', confianza: 'alta' })
    expect(classifyDistance(0.29)).toEqual({ status: 'MATCH', confianza: 'alta' })
  })

  it('0.3 a 0.5 es MATCH con tolerancia (luz/angulo)', () => {
    expect(classifyDistance(0.3)).toEqual({ status: 'MATCH', confianza: 'tolerancia' })
    expect(classifyDistance(0.49)).toEqual({ status: 'MATCH', confianza: 'tolerancia' })
  })

  it('0.5 a 0.7 es REQUIRE_PIN (zona de incertidumbre)', () => {
    expect(classifyDistance(0.5).status).toBe('REQUIRE_PIN')
    expect(classifyDistance(0.7).status).toBe('REQUIRE_PIN')
  })

  it('> 0.7 es DENIED (persona diferente)', () => {
    expect(classifyDistance(0.71).status).toBe('DENIED')
    expect(classifyDistance(1.5).status).toBe('DENIED')
  })
})
