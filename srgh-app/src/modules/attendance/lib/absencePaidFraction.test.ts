import { describe, expect, it } from 'vitest'
import { absencePaidFraction } from './absencePaidFraction'

describe('absencePaidFraction', () => {
  it.each([
    [true, 100, 0],
    [false, null, 0],
    [false, -10, 0],
    [false, 0, 0],
    [false, 60, 0.6],
    [false, 100, 1],
    [false, 120, 1],
  ])(
    'calculates the fraction for a CCSS requirement of %s and employer pay of %s',
    (ccss, pay, fraction) => {
      expect(
        absencePaidFraction({
          tau_requiere_documento_ccss: ccss,
          tau_porcentaje_pago_empleador: pay,
        })
      ).toBe(fraction)
    }
  )
})
