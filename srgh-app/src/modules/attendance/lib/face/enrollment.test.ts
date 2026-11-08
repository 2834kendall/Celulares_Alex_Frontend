import { describe, expect, it } from 'vitest'
import { enrollmentMedoid } from './enrollment'

const vector = (x: number) => [x, ...Array<number>(127).fill(0)]

describe('enrollmentMedoid', () => {
  it('selects the actual central descriptor without changing magnitude', () => {
    const samples = [vector(1), vector(1.1), vector(1.3)]
    expect(enrollmentMedoid(samples)).toBe(samples[1])
  })
  it('does not replace enrollment when captures disagree', () => {
    expect(() => enrollmentMedoid([vector(0), vector(0.1), vector(0.8)])).toThrow('consistentes')
  })
  it('rejects missing, malformed and nonfinite descriptors', () => {
    expect(() => enrollmentMedoid([vector(0)])).toThrow()
    expect(() => enrollmentMedoid([vector(0), [0], vector(0)])).toThrow()
    expect(() => enrollmentMedoid([vector(0), vector(NaN), vector(0)])).toThrow()
  })
})
