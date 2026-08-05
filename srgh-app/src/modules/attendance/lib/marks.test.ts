import { describe, expect, it } from 'vitest'
import { groupIntoDayJourney, type RawMark } from './marks'

function mark(id: number, tipo: RawMark['tipo'], hora: string): RawMark {
  return { id, tipo, fechaHora: `2026-07-25 ${hora}` }
}

describe('groupIntoDayJourney', () => {
  it('arma una jornada completa con las cuatro marcas', () => {
    const journey = groupIntoDayJourney([
      mark(1, 'entrada', '08:00:00'),
      mark(2, 'inicio_almuerzo', '12:00:00'),
      mark(3, 'fin_almuerzo', '13:00:00'),
      mark(4, 'salida', '17:00:00'),
    ])

    expect(journey.entrada?.id).toBe(1)
    expect(journey.inicioAlmuerzo?.id).toBe(2)
    expect(journey.finAlmuerzo?.id).toBe(3)
    expect(journey.salida?.id).toBe(4)
    expect(journey.duplicates).toHaveLength(0)
    expect(journey.isOpen).toBe(false)
  })

  it('no importa el orden de llegada: siempre ordena por hora', () => {
    const journey = groupIntoDayJourney([
      mark(4, 'salida', '17:00:00'),
      mark(1, 'entrada', '08:00:00'),
    ])

    expect(journey.entrada?.id).toBe(1)
    expect(journey.salida?.id).toBe(4)
  })

  it('marca la jornada como abierta cuando hay entrada sin salida', () => {
    const journey = groupIntoDayJourney([mark(1, 'entrada', '08:00:00')])

    expect(journey.isOpen).toBe(true)
    expect(journey.salida).toBeNull()
  })

  it('no esta abierta cuando no hay ninguna marca', () => {
    const journey = groupIntoDayJourney([])

    expect(journey.isOpen).toBe(false)
    expect(journey.entrada).toBeNull()
  })

  it('toma la primera marca cronologica de un tipo repetido y el resto va a duplicates', () => {
    const journey = groupIntoDayJourney([
      mark(1, 'entrada', '08:00:00'),
      mark(2, 'entrada', '08:01:00'),
    ])

    expect(journey.entrada?.id).toBe(1)
    expect(journey.duplicates).toHaveLength(1)
    expect(journey.duplicates[0].id).toBe(2)
  })

  it('acumula duplicados de mas de un tipo', () => {
    const journey = groupIntoDayJourney([
      mark(1, 'entrada', '08:00:00'),
      mark(2, 'entrada', '08:01:00'),
      mark(3, 'salida', '17:00:00'),
      mark(4, 'salida', '17:05:00'),
    ])

    expect(journey.duplicates.map((m) => m.id)).toEqual([2, 4])
  })
})
