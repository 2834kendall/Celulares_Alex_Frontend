import { describe, expect, it } from 'vitest'
import { stripSeconds } from './time'

describe('stripSeconds', () => {
  it('recorta los segundos de un tiempo HH:mm:ss', () => {
    expect(stripSeconds('08:30:00')).toBe('08:30')
  })

  it('deja igual un tiempo que ya viene sin segundos', () => {
    expect(stripSeconds('08:30')).toBe('08:30')
  })

  it('devuelve null cuando recibe null', () => {
    expect(stripSeconds(null)).toBeNull()
  })

  it('devuelve undefined cuando recibe undefined', () => {
    expect(stripSeconds(undefined)).toBeUndefined()
  })

  it('devuelve string vacio cuando recibe string vacio', () => {
    expect(stripSeconds('')).toBe('')
  })
})
