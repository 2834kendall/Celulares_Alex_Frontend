import { describe, expect, it } from 'vitest'
import { isLivenessProof } from './livenessProof'

describe('liveness policy shared with the server', () => {
  it('requires the same score and sample minimum as capture', () => {
    expect(isLivenessProof({ method: 'textura', score: 0.6, samples: 5 })).toBe(true)
    expect(isLivenessProof({ method: 'textura', score: 0.59, samples: 5 })).toBe(false)
    expect(isLivenessProof({ method: 'textura', score: 0.99, samples: 4 })).toBe(false)
    expect(isLivenessProof({ method: 'textura', score: NaN, samples: 5 })).toBe(false)
  })
})
