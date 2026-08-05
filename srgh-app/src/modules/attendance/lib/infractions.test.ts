import { describe, expect, it } from 'vitest'
import { classifyDay, shouldWarn, summarizeMonth, type DayForInfraction } from './infractions'

function day(overrides: Partial<DayForInfraction> = {}): DayForInfraction {
  return {
    isDayOff: false,
    isHoliday: false,
    expectedStart: '08:00',
    entradaTime: '08:00',
    toleranciaMinutos: 2,
    ...overrides,
  }
}

describe('classifyDay', () => {
  it('es "no_aplica" en dia libre', () => {
    expect(classifyDay(day({ isDayOff: true }))).toBe('no_aplica')
  })

  it('es "no_aplica" en feriado', () => {
    expect(classifyDay(day({ isHoliday: true }))).toBe('no_aplica')
  })

  it('es "no_aplica" sin programacion', () => {
    expect(classifyDay(day({ expectedStart: null }))).toBe('no_aplica')
  })

  it('es "ausente" si no hay marca de entrada', () => {
    expect(classifyDay(day({ entradaTime: null }))).toBe('ausente')
  })

  it('es "a_tiempo" dentro de la tolerancia', () => {
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:02', toleranciaMinutos: 2 }))
    ).toBe('a_tiempo')
  })

  it('es "tardio" fuera de la tolerancia', () => {
    expect(
      classifyDay(day({ expectedStart: '08:00', entradaTime: '08:03', toleranciaMinutos: 2 }))
    ).toBe('tardio')
  })

  it('llegar temprano nunca es tardio', () => {
    expect(classifyDay(day({ expectedStart: '08:00', entradaTime: '07:50' }))).toBe('a_tiempo')
  })
})

describe('summarizeMonth', () => {
  it('cuenta tardias y ausencias por separado, ignorando dias no_aplica', () => {
    const days = [
      day({ entradaTime: '08:00' }), // a_tiempo
      day({ entradaTime: '08:10' }), // tardio
      day({ entradaTime: null }), // ausente
      day({ isDayOff: true }), // no_aplica
    ]

    expect(summarizeMonth(days)).toEqual({ tardias: 1, ausencias: 1 })
  })
})

describe('shouldWarn', () => {
  it('no advierte por debajo de los limites', () => {
    expect(shouldWarn({ tardias: 2, ausencias: 0 })).toBe(false)
  })

  it('advierte con 3 tardias', () => {
    expect(shouldWarn({ tardias: 3, ausencias: 0 })).toBe(true)
  })

  it('advierte con 1 ausencia', () => {
    expect(shouldWarn({ tardias: 0, ausencias: 1 })).toBe(true)
  })
})
