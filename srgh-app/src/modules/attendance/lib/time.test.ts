import { describe, expect, it } from 'vitest'
import {
  diffMinutes,
  formatInCostaRica,
  isValidISODate,
  nowInCostaRica,
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
  it('extrae HH:mm de un valor "YYYY-MM-DD HH:mm:ss"', () => {
    expect(timeOfDay('2026-01-15 08:04:32')).toBe('08:04')
  })

  it('extrae HH:mm de un valor "HH:mm:ss" suelto', () => {
    expect(timeOfDay('08:04:32')).toBe('08:04')
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
