import { describe, expect, it } from 'vitest'
import {
  dateOfDay,
  diffMinutes,
  formatInCostaRica,
  isValidISODate,
  monthBoundsInCostaRica,
  nowInCostaRica,
  shiftISODate,
  timeOfDay,
  todayInCostaRica,
  toMinutes,
} from './time'

describe('formatInCostaRica', () => {
  it('convierte un instante UTC a la hora de pared de Costa Rica (UTC-6)', () => {
    expect(formatInCostaRica(new Date('2026-01-15T14:30:00Z'))).toBe('2026-01-15 08:30:00')
  })

  it('retrocede al dia anterior cuando el instante UTC cae en la madrugada', () => {
    expect(formatInCostaRica(new Date('2026-01-15T04:00:00Z'))).toBe('2026-01-14 22:00:00')
  })

  it('no aplica horario de verano (Costa Rica no lo observa)', () => {
    // Un instante en pleno verano boreal (donde otros paises SI cambian de offset).
    expect(formatInCostaRica(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07-15 06:00:00')
  })
})

describe('nowInCostaRica', () => {
  it('devuelve el formato naive "YYYY-MM-DD HH:mm:ss"', () => {
    expect(nowInCostaRica()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('todayInCostaRica', () => {
  it('devuelve solo la fecha, en formato "YYYY-MM-DD"', () => {
    expect(todayInCostaRica()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('shiftISODate', () => {
  it('resta dias correctamente', () => {
    expect(shiftISODate('2026-07-25', -14)).toBe('2026-07-11')
  })

  it('suma dias correctamente', () => {
    expect(shiftISODate('2026-07-25', 1)).toBe('2026-07-26')
  })

  it('cruza el limite de mes hacia atras', () => {
    expect(shiftISODate('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('con delta 0 devuelve la misma fecha', () => {
    expect(shiftISODate('2026-07-25', 0)).toBe('2026-07-25')
  })
})

describe('isValidISODate', () => {
  it('acepta una fecha valida', () => {
    expect(isValidISODate('2026-07-25')).toBe(true)
  })

  it('rechaza un formato invalido', () => {
    expect(isValidISODate('25-07-2026')).toBe(false)
  })

  it('rechaza un mes inexistente', () => {
    expect(isValidISODate('2026-13-01')).toBe(false)
    expect(isValidISODate('2026-00-01')).toBe(false)
  })
})

describe('timeOfDay', () => {
  it('extrae HH:mm de un valor "YYYY-MM-DD HH:mm:ss" (formato con el que este modulo escribe)', () => {
    expect(timeOfDay('2026-01-15 08:04:32')).toBe('08:04')
  })

  // Bug real encontrado probando en el navegador: Postgres/PostgREST
  // devuelve el timestamp con 'T' al leerlo, aunque se haya insertado con
  // espacio — timeOfDay debe tolerar ambos, no solo el formato de escritura.
  it('extrae HH:mm de un valor "YYYY-MM-DDTHH:mm:ss" (formato con el que Supabase lo devuelve al leer)', () => {
    expect(timeOfDay('2026-01-15T08:04:32')).toBe('08:04')
  })

  it('extrae HH:mm de un valor "HH:mm:ss" suelto', () => {
    expect(timeOfDay('08:04:32')).toBe('08:04')
  })
})

describe('dateOfDay', () => {
  it('extrae la fecha de un valor con espacio', () => {
    expect(dateOfDay('2026-01-15 08:04:32')).toBe('2026-01-15')
  })

  it('extrae la fecha de un valor con "T" (formato de lectura de Supabase)', () => {
    expect(dateOfDay('2026-01-15T08:04:32')).toBe('2026-01-15')
  })
})

describe('toMinutes', () => {
  it('convierte "HH:mm" a minutos desde medianoche', () => {
    expect(toMinutes('08:04')).toBe(484)
  })

  it('acepta "HH:mm:ss" ignorando los segundos', () => {
    expect(toMinutes('08:04:32')).toBe(484)
  })

  it('medianoche es 0', () => {
    expect(toMinutes('00:00')).toBe(0)
  })
})

describe('diffMinutes', () => {
  it('es positivo cuando la marca es mas tarde de lo esperado', () => {
    expect(diffMinutes('08:04', '08:00')).toBe(4)
  })

  it('es negativo cuando la marca es mas temprano de lo esperado', () => {
    expect(diffMinutes('07:55', '08:00')).toBe(-5)
  })

  it('es cero cuando coincide exactamente', () => {
    expect(diffMinutes('08:00', '08:00')).toBe(0)
  })
})

describe('monthBoundsInCostaRica', () => {
  it('devuelve el primer y ultimo dia de un mes de 31 dias', () => {
    expect(monthBoundsInCostaRica('2026-07-15')).toEqual({ start: '2026-07-01', end: '2026-07-31' })
  })

  it('devuelve el ultimo dia correcto para febrero (no bisiesto)', () => {
    expect(monthBoundsInCostaRica('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('devuelve el ultimo dia correcto para febrero bisiesto', () => {
    expect(monthBoundsInCostaRica('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
})
