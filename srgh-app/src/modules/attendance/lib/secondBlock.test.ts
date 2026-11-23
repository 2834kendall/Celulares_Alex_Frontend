import { describe, expect, it } from 'vitest'
import { secondBlockStart } from './secondBlock'

describe('secondBlockStart', () => {
  it('con un solo bloque no hay segundo', () => {
    expect(secondBlockStart(['08:00'])).toBeNull()
    expect(secondBlockStart([])).toBeNull()
  })

  it('devuelve la segunda hora de inicio, sin importar el orden en que llegan', () => {
    expect(secondBlockStart(['16:00', '07:00'])).toBe('16:00')
    expect(secondBlockStart(['07:00', '16:00'])).toBe('16:00')
  })

  it('ignora lo que no esta definido', () => {
    expect(secondBlockStart(['07:00', null, undefined, '13:00'])).toBe('13:00')
    expect(secondBlockStart([null, '08:00', null])).toBeNull()
  })

  it('un horario de manana y otro de tarde en dos tramos tambien cuenta', () => {
    expect(secondBlockStart(['08:00', null, '13:00', null])).toBe('13:00')
  })
})
