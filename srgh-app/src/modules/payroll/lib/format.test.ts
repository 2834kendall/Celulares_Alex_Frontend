import { describe, expect, it } from 'vitest'
import { formatHoras } from '@/modules/payroll/lib/format'

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
