import { describe, expect, it } from 'vitest'
import { calcularHorasExtraPendientes, calcularMontoSugeridoBancoHoras } from './bancoHoras'

describe('calcularHorasExtraPendientes', () => {
  it('devuelve 0 si las horas trabajadas no pasan del tope (88)', () => {
    expect(calcularHorasExtraPendientes(88)).toBe(0)
    expect(calcularHorasExtraPendientes(80)).toBe(0)
  })

  it('devuelve las horas de más cuando se pasa del tope', () => {
    expect(calcularHorasExtraPendientes(96)).toBe(8)
    expect(calcularHorasExtraPendientes(90.5)).toBe(2.5)
  })

  it('nunca devuelve un número negativo', () => {
    expect(calcularHorasExtraPendientes(0)).toBe(0)
  })
})

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
