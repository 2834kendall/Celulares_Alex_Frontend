import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WEEKDAY_NAMES,
  currentMondayISO,
  getWeekDates,
  isValidISODate,
  shiftWeekISO,
  toISODate,
} from './week'

describe('toISODate', () => {
  it('formatea usando el calendario local, sin desplazamiento UTC', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('rellena con ceros mes y dia de un digito', () => {
    expect(toISODate(new Date(2026, 2, 9))).toBe('2026-03-09')
  })
})

describe('getWeekDates', () => {
  it('devuelve los 7 dias de lunes a domingo dada una fecha entre semana', () => {
    // 2026-01-07 es miercoles
    expect(getWeekDates('2026-01-07')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ])
  })

  it('retrocede al lunes anterior cuando la fecha es domingo', () => {
    // 2026-01-11 es domingo
    expect(getWeekDates('2026-01-11')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ])
  })

  it('cuando la fecha ya es lunes, la semana empieza en ese mismo dia', () => {
    expect(getWeekDates('2026-01-05')[0]).toBe('2026-01-05')
  })
})

describe('currentMondayISO', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve el lunes de la semana actual', () => {
    // 2026-01-07 es miercoles
    vi.setSystemTime(new Date(2026, 0, 7))
    expect(currentMondayISO()).toBe('2026-01-05')
  })

  it('retrocede correctamente cuando hoy es domingo', () => {
    vi.setSystemTime(new Date(2026, 0, 11))
    expect(currentMondayISO()).toBe('2026-01-05')
  })
})

describe('shiftWeekISO', () => {
  it('avanza una semana', () => {
    expect(shiftWeekISO('2026-01-05', 1)).toBe('2026-01-12')
  })

  it('retrocede una semana', () => {
    expect(shiftWeekISO('2026-01-05', -1)).toBe('2025-12-29')
  })

  it('cruza el cambio de mes y de año sin desplazamiento', () => {
    expect(shiftWeekISO('2026-12-28', 1)).toBe('2027-01-04')
  })
})

describe('isValidISODate', () => {
  it('acepta una fecha valida con formato correcto', () => {
    expect(isValidISODate('2026-01-05')).toBe(true)
  })

  it('rechaza un formato invalido', () => {
    expect(isValidISODate('05-01-2026')).toBe(false)
    expect(isValidISODate('2026/01/05')).toBe(false)
    expect(isValidISODate('')).toBe(false)
  })

  it('rechaza una fecha con formato correcto pero un mes inexistente', () => {
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2026-00-01')).toBe(false)
  })
})

describe('WEEKDAY_NAMES', () => {
  it('tiene los 7 dias en orden empezando en Lunes', () => {
    expect(WEEKDAY_NAMES).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ])
  })
})
