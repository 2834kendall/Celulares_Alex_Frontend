import { describe, expect, it } from 'vitest'
import { compareByStart, describeAssignmentError } from './dayAssignment'

describe('compareByStart', () => {
  it('ordena por hora de inicio', () => {
    const horas = ['13:00:00', '08:00:00', '10:30:00']
    expect([...horas].sort(compareByStart)).toEqual(['08:00:00', '10:30:00', '13:00:00'])
  })

  it('pone primero lo que no tiene hora (un dia libre)', () => {
    const horas = ['08:00:00', null, '07:00:00']
    expect([...horas].sort(compareByStart)).toEqual([null, '07:00:00', '08:00:00'])
  })

  it('dos iguales empatan, incluidos dos sin hora', () => {
    expect(compareByStart('08:00:00', '08:00:00')).toBe(0)
    expect(compareByStart(null, null)).toBe(0)
  })
})

describe('describeAssignmentError', () => {
  const FALLBACK = 'No se pudo guardar.'

  it('sin error devuelve el mensaje por defecto', () => {
    expect(describeAssignmentError(null, FALLBACK)).toBe(FALLBACK)
    expect(describeAssignmentError(undefined, FALLBACK)).toBe(FALLBACK)
  })

  it('traduce el indice unico: un tramo por sucursal y dia', () => {
    expect(describeAssignmentError({ code: '23505', message: 'duplicate key' }, FALLBACK)).toMatch(
      /ya tiene un tramo en esa sucursal ese día/
    )
  })

  it('reusa el mensaje del trigger de traslapes, que dice que horas chocan', () => {
    const message =
      'Los tramos del mismo día no pueden traslaparse (11:00 a 15:00 contra 08:00 a 12:00).'
    expect(describeAssignmentError({ code: '23P01', message }, FALLBACK)).toBe(message)
  })

  it('reusa el mensaje del trigger de dia libre', () => {
    const message = 'Un día libre no puede tener otros tramos el mismo día.'
    expect(describeAssignmentError({ code: '23514', message }, FALLBACK)).toBe(message)
  })

  it('no filtra el texto de otros errores, aunque el codigo coincida', () => {
    expect(
      describeAssignmentError(
        { code: '23P01', message: 'conflicting key value ... "otra"' },
        FALLBACK
      )
    ).toBe(FALLBACK)
    expect(
      describeAssignmentError(
        { code: '23514', message: 'new row violates check constraint' },
        FALLBACK
      )
    ).toBe(FALLBACK)
  })

  it('cualquier otro codigo cae al mensaje por defecto', () => {
    expect(describeAssignmentError({ code: '42501', message: 'permission denied' }, FALLBACK)).toBe(
      FALLBACK
    )
    expect(describeAssignmentError({ message: 'boom' }, FALLBACK)).toBe(FALLBACK)
  })
})
