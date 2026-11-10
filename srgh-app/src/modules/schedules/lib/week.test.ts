import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WEEKDAY_NAMES,
  currentMondayISO,
  getWeekDates,
  isValidISODate,
  shiftWeekISO,
  toISODate,
} from './week'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

vi.mock('@/modules/attendance/lib/time', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/attendance/lib/time')>()
  return { ...actual, todayInCostaRica: vi.fn(actual.todayInCostaRica) }
})

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

  // Instantes con zona explícita: con la hora local, el resultado dependía de la máquina.
  it('devuelve el lunes de la semana actual', () => {
    // 2026-01-07 es miercoles
    vi.setSystemTime(new Date('2026-01-07T18:00:00Z'))
    expect(currentMondayISO()).toBe('2026-01-05')
  })

  it('retrocede correctamente cuando hoy es domingo', () => {
    vi.setSystemTime(new Date('2026-01-11T18:00:00Z'))
    expect(currentMondayISO()).toBe('2026-01-05')
  })

  it('un lunes es el inicio de su propia semana', () => {
    vi.setSystemTime(new Date('2026-01-05T18:00:00Z'))
    expect(currentMondayISO()).toBe('2026-01-05')
  })

  /*
   * La regresión la encontró el E2E en CI: domingo 6:54 p. m. en Costa Rica, con el
   * servidor en UTC ya es lunes. La pantalla saltaba a la semana siguiente y los turnos
   * de hoy desaparecían. Este test falla en cualquier máquina si la fecha no sale de
   * Costa Rica; los dos de abajo solo muestran el bug con el proceso en UTC, como en CI.
   */
  it('la semana sale del día de Costa Rica, no del reloj del proceso', () => {
    vi.setSystemTime(new Date('2026-01-07T18:00:00Z'))
    vi.mocked(todayInCostaRica).mockReturnValueOnce('2026-11-04')
    expect(currentMondayISO()).toBe('2026-11-02')
  })

  it('el domingo en la noche de Costa Rica sigue en esa semana, aunque en UTC ya sea lunes', () => {
    vi.setSystemTime(new Date('2026-11-09T00:54:00Z'))
    expect(currentMondayISO()).toBe('2026-11-02')
  })

  it('la semana nueva empieza a la medianoche de Costa Rica, no a la de UTC', () => {
    vi.setSystemTime(new Date('2026-11-09T05:59:00Z'))
    expect(currentMondayISO()).toBe('2026-11-02')

    vi.setSystemTime(new Date('2026-11-09T06:00:00Z'))
    expect(currentMondayISO()).toBe('2026-11-09')
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
