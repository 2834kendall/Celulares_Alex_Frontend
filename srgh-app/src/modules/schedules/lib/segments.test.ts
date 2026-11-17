import { describe, expect, it } from 'vitest'
import { dayHours, tramosOf } from './segments'

interface Tramo {
  hours: number
  extraTramos?: Tramo[]
}

describe('tramosOf', () => {
  it('devuelve solo el dia cuando no tiene tramos extra', () => {
    const day: Tramo = { hours: 8 }
    expect(tramosOf(day)).toEqual([day])
  })

  it('pone el primer tramo primero y luego los extra, en orden', () => {
    const extra1: Tramo = { hours: 4 }
    const extra2: Tramo = { hours: 2 }
    const day: Tramo = { hours: 4, extraTramos: [extra1, extra2] }
    expect(tramosOf(day)).toEqual([day, extra1, extra2])
  })
})

describe('dayHours', () => {
  it('es el total del unico tramo cuando no hay extras', () => {
    expect(dayHours({ hours: 7.5 })).toBe(7.5)
  })

  it('suma todos los tramos del dia', () => {
    const day: Tramo = { hours: 4, extraTramos: [{ hours: 4 }, { hours: 1.5 }] }
    expect(dayHours(day)).toBe(9.5)
  })
})
