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

describe('groupIntoDayJourney por bloques (SGRH-110)', () => {
  const porBloques = { byBlocks: true }

  it('un dia de dos bloques va de la primera entrada a la ultima salida, sin duplicados', () => {
    const journey = groupIntoDayJourney(
      [
        mark(1, 'entrada', '07:00:00'),
        mark(2, 'salida', '11:00:00'),
        mark(3, 'entrada', '16:00:00'),
        mark(4, 'salida', '20:00:00'),
      ],
      porBloques
    )

    expect(journey.entrada?.id).toBe(1)
    expect(journey.salida?.id).toBe(4)
    expect(journey.blocks.map((b) => [b.entrada.id, b.salida?.id])).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(journey.duplicates).toHaveLength(0)
    expect(journey.isOpen).toBe(false)
  })

  it('si el ultimo bloque sigue abierto no hay salida y la jornada queda abierta', () => {
    const journey = groupIntoDayJourney(
      [
        mark(1, 'entrada', '07:00:00'),
        mark(2, 'salida', '11:00:00'),
        mark(3, 'entrada', '16:00:00'),
      ],
      porBloques
    )

    expect(journey.salida).toBeNull()
    expect(journey.isOpen).toBe(true)
    expect(journey.blocks).toHaveLength(2)
    expect(journey.blocks[1].salida).toBeNull()
  })

  it('un dia de tres bloques los conserva todos', () => {
    const journey = groupIntoDayJourney(
      [
        mark(1, 'entrada', '06:00:00'),
        mark(2, 'salida', '09:00:00'),
        mark(3, 'entrada', '11:00:00'),
        mark(4, 'salida', '14:00:00'),
        mark(5, 'entrada', '16:00:00'),
        mark(6, 'salida', '19:00:00'),
      ],
      porBloques
    )

    expect(journey.blocks).toHaveLength(3)
    expect(journey.entrada?.id).toBe(1)
    expect(journey.salida?.id).toBe(6)
  })

  it('el almuerzo marcado dentro de un bloque sigue su regla de siempre', () => {
    const journey = groupIntoDayJourney(
      [
        mark(1, 'entrada', '07:00:00'),
        mark(2, 'inicio_almuerzo', '09:00:00'),
        mark(3, 'fin_almuerzo', '09:30:00'),
        mark(4, 'salida', '11:00:00'),
        mark(5, 'entrada', '16:00:00'),
        mark(6, 'salida', '20:00:00'),
      ],
      porBloques
    )

    expect(journey.inicioAlmuerzo?.id).toBe(2)
    expect(journey.finAlmuerzo?.id).toBe(3)
    expect(journey.blocks).toHaveLength(2)
    expect(journey.duplicates).toHaveLength(0)
  })

  it('un dia de un solo bloque no cambia: blocks queda vacio', () => {
    const journey = groupIntoDayJourney(
      [mark(1, 'entrada', '08:00:00'), mark(2, 'salida', '17:00:00')],
      porBloques
    )

    expect(journey.blocks).toEqual([])
    expect(journey.entrada?.id).toBe(1)
    expect(journey.salida?.id).toBe(2)
  })

  it('marcas que no alternan (un doble toque) se leen como siempre, con duplicados', () => {
    const journey = groupIntoDayJourney(
      [
        mark(1, 'entrada', '08:00:00'),
        mark(2, 'entrada', '08:01:00'),
        mark(3, 'salida', '17:00:00'),
      ],
      porBloques
    )

    expect(journey.blocks).toEqual([])
    expect(journey.entrada?.id).toBe(1)
    expect(journey.duplicates.map((m) => m.id)).toEqual([2])
  })

  it('sin pedir bloques, cuatro marcas siguen leyendose como primera y duplicadas', () => {
    const journey = groupIntoDayJourney([
      mark(1, 'entrada', '07:00:00'),
      mark(2, 'salida', '11:00:00'),
      mark(3, 'entrada', '16:00:00'),
      mark(4, 'salida', '20:00:00'),
    ])

    expect(journey.blocks).toEqual([])
    expect(journey.salida?.id).toBe(2)
    expect(journey.duplicates.map((m) => m.id)).toEqual([3, 4])
  })
})
