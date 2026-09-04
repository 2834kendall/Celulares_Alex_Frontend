import { describe, expect, it } from 'vitest'
import { calcularMontoSugeridoBancoHoras } from './bancoHoras'

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
})
