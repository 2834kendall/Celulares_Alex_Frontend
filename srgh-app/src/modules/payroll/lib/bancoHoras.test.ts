import { describe, expect, it } from 'vitest'
import { calcularMontoSugeridoBancoHoras, factorHorasExtra } from './bancoHoras'

describe('calcularMontoSugeridoBancoHoras', () => {
  it('calcula horas × salario por hora × 1.5', () => {
    expect(calcularMontoSugeridoBancoHoras(8, 2500)).toBe(30000)
  })

  it('redondea a 2 decimales', () => {
    expect(calcularMontoSugeridoBancoHoras(2.5, 3409.09)).toBe(12784.09) // 2.5 * 3409.09 * 1.5
  })

  it('da 0 si no hay horas', () => {
    expect(calcularMontoSugeridoBancoHoras(0, 5000)).toBe(0)
  })

  it('usa el factor que le pasen', () => {
    expect(calcularMontoSugeridoBancoHoras(8, 2500, 2)).toBe(40000)
  })
})

// El 1,5 estaba quemado en el código y el porcentaje del concepto HORAS_EXTRA
// no se miraba: cambiarlo en Conceptos no tenía ningún efecto sobre el banco
// de horas.
describe('factorHorasExtra', () => {
  it('convierte el porcentaje del catálogo en factor', () => {
    expect(factorHorasExtra(150)).toBe(1.5)
    expect(factorHorasExtra(200)).toBe(2)
    expect(factorHorasExtra(100)).toBe(1)
  })

  it('cae a tiempo y medio si el catálogo no dice nada utilizable', () => {
    expect(factorHorasExtra(null)).toBe(1.5)
    expect(factorHorasExtra(undefined)).toBe(1.5)
    expect(factorHorasExtra(0)).toBe(1.5)
    expect(factorHorasExtra(-50)).toBe(1.5)
    expect(factorHorasExtra(Number.NaN)).toBe(1.5)
  })
})
