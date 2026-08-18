import { describe, expect, it } from 'vitest'
import { formatHoursValue, hoursBetween } from './hours'

describe('hoursBetween', () => {
  it('calcula el tramo completo sin almuerzo ni break', () => {
    expect(hoursBetween('08:00', '16:00')).toBe(8)
  })

  it('resta el almuerzo completo', () => {
    expect(hoursBetween('08:00', '17:00', '12:00', '13:00')).toBe(8)
  })

  it('un break de hasta 10 minutos no descuenta nada (esta pagado)', () => {
    expect(hoursBetween('08:00', '16:00', null, null, '10:00', '10:10')).toBe(8)
  })

  it('un break de mas de 10 minutos solo descuenta el exceso', () => {
    // 70 min de break: 10 pagados + 60 de exceso -> se resta 1h de las 8h del tramo.
    expect(hoursBetween('08:00', '16:00', null, null, '10:00', '11:10')).toBe(7)
  })

  it('nunca da negativo aunque el tramo sea mas corto que los descuentos', () => {
    expect(hoursBetween('08:00', '08:30', '08:00', '08:30')).toBe(0)
  })
})

describe('formatHoursValue', () => {
  it('numeros enteros sin decimales', () => {
    expect(formatHoursValue(40)).toBe('40')
  })

  it('numeros con fraccion a un decimal', () => {
    expect(formatHoursValue(7.5)).toBe('7.5')
  })
})
