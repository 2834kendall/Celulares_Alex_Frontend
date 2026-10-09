import { describe, expect, it } from 'vitest'
import {
  agoLabel,
  countdownLabel,
  toRecentHires,
  toUpcomingAnniversaries,
  toUpcomingBirthdays,
  type BirthdaySource,
} from './birthdays'

function person(id: number, fechaNacimiento: string): BirthdaySource {
  return {
    id,
    nombre: `Persona ${id}`,
    puesto: null,
    sucursal: null,
    fotoUrl: null,
    fechaNacimiento,
  }
}

describe('toUpcomingBirthdays', () => {
  it('sorts from the closest to the farthest, today first', () => {
    const result = toUpcomingBirthdays(
      [person(1, '1990-12-25'), person(2, '1985-10-06'), person(3, '2000-10-09')],
      '2026-10-06'
    )

    expect(result.map((b) => [b.id, b.daysUntil])).toEqual([
      [2, 0],
      [3, 3],
      [1, 80],
    ])
  })

  it('rolls a birthday that already went by over to next year', () => {
    const [birthday] = toUpcomingBirthdays([person(1, '1990-10-05')], '2026-10-06')

    expect(birthday.daysUntil).toBe(364)
    expect(birthday.dateLabel).toBe('5 oct')
  })

  it('labels the date and the weekday of the next celebration', () => {
    const [birthday] = toUpcomingBirthdays([person(1, '1990-10-12')], '2026-10-06')

    expect(birthday.dateLabel).toBe('12 oct')
    expect(birthday.weekday).toBe('lunes')
  })

  it('celebrates Feb 29 on Feb 28 in a year without one', () => {
    const [birthday] = toUpcomingBirthdays([person(1, '2000-02-29')], '2027-02-01')

    expect(birthday.dateLabel).toBe('28 feb')
    expect(birthday.daysUntil).toBe(27)
  })

  it('never exposes the birth year', () => {
    const [birthday] = toUpcomingBirthdays([person(1, '1990-10-12')], '2026-10-06')

    expect(JSON.stringify(birthday)).not.toContain('1990')
  })

  it('skips malformed dates', () => {
    expect(toUpcomingBirthdays([person(1, 'sin-fecha')], '2026-10-06')).toEqual([])
  })
})

describe('countdownLabel', () => {
  it('names today and tomorrow, and counts the rest', () => {
    expect(countdownLabel(0)).toBe('Hoy')
    expect(countdownLabel(1)).toBe('Mañana')
    expect(countdownLabel(6)).toBe('en 6 días')
  })
})

describe('toUpcomingAnniversaries', () => {
  function joined(id: number, fechaIngreso: string) {
    return {
      id,
      nombre: `Persona ${id}`,
      puesto: null,
      sucursal: null,
      fotoUrl: null,
      fechaIngreso,
    }
  }

  it('counts the years they reach on their next anniversary, closest first', () => {
    const result = toUpcomingAnniversaries(
      [joined(1, '2020-12-01'), joined(2, '2023-10-10')],
      '2026-10-07'
    )

    expect(result.map((a) => [a.id, a.years, a.daysUntil])).toEqual([
      [2, 3, 3],
      [1, 6, 55],
    ])
  })

  it('rolls over to next year once this year has gone by', () => {
    const [anniversary] = toUpcomingAnniversaries([joined(1, '2024-03-01')], '2026-10-07')

    expect(anniversary.years).toBe(3)
    expect(anniversary.dateLabel).toBe('1 mar')
  })

  it('leaves out whoever has not completed a first year yet', () => {
    expect(toUpcomingAnniversaries([joined(1, '2026-08-01')], '2026-10-07')).toHaveLength(1)
    expect(toUpcomingAnniversaries([joined(1, '2026-11-01')], '2026-10-07')).toEqual([])
  })

  it('counts an anniversary that falls today', () => {
    const [anniversary] = toUpcomingAnniversaries([joined(1, '2021-10-07')], '2026-10-07')

    expect(anniversary).toMatchObject({ years: 5, daysUntil: 0 })
  })
})

describe('toRecentHires', () => {
  function joined(id: number, fechaIngreso: string) {
    return {
      id,
      nombre: `Persona ${id}`,
      puesto: null,
      sucursal: null,
      fotoUrl: null,
      fechaIngreso,
    }
  }

  it('keeps who joined inside the window, newest first', () => {
    const hires = toRecentHires(
      [joined(1, '2026-08-20'), joined(2, '2026-10-01'), joined(3, '2026-07-01')],
      '2026-10-07',
      60
    )

    expect(hires.map((hire) => [hire.id, hire.daysAgo])).toEqual([
      [2, 6],
      [1, 48],
    ])
    expect(hires[0].dateLabel).toBe('1 oct')
  })

  it('leaves out a start date that has not arrived yet', () => {
    expect(toRecentHires([joined(1, '2026-10-20')], '2026-10-07', 60)).toEqual([])
  })

  it('counts someone who joined today', () => {
    expect(toRecentHires([joined(1, '2026-10-07')], '2026-10-07', 60)[0].daysAgo).toBe(0)
  })
})

describe('agoLabel', () => {
  it('names today and yesterday, and counts the rest', () => {
    expect(agoLabel(0)).toBe('Hoy')
    expect(agoLabel(1)).toBe('Ayer')
    expect(agoLabel(9)).toBe('hace 9 días')
  })
})
