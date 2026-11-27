import { describe, expect, it } from 'vitest'
import { formatCRC, formatHoras } from '@/modules/payroll/lib/format'

describe('formatHoras', () => {
  it('muestra los enteros sin decimales', () => {
    expect(formatHoras(8)).toBe('8')
    expect(formatHoras(0)).toBe('0')
  })
  it('muestra las medias horas con un decimal', () => {
    expect(formatHoras(7.5)).toBe('7.5')
  })
  it('conserva dos decimales cuando hacen falta', () => {
    expect(formatHoras(7.25)).toBe('7.25')
  })
  it('trata la ausencia de dato como cero', () => {
    expect(formatHoras(null)).toBe('0')
    expect(formatHoras(undefined)).toBe('0')
  })
})

describe('formatCRC', () => {
  // Intl separa los miles con un espacio especial: se normaliza para comparar.
  const texto = (monto: number | null | undefined) => formatCRC(monto).replace(/\s/g, ' ')

  it('muestra los montos enteros sin decimales', () => {
    expect(texto(235001)).toBe('₡235 001')
    expect(texto(0)).toBe('₡0')
  })
  it('muestra siempre dos decimales cuando hay céntimos', () => {
    expect(texto(235001.5)).toBe('₡235 001,50')
    expect(texto(10700.4)).toBe('₡10 700,40')
    expect(texto(3858.19)).toBe('₡3 858,19')
  })
  it('un monto que redondea a entero no lleva decimales', () => {
    expect(texto(1000.004)).toBe('₡1 000')
  })
  it('sin dato muestra una raya', () => {
    expect(formatCRC(null)).toBe('—')
    expect(formatCRC(undefined)).toBe('—')
  })
})
