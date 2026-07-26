import { describe, expect, it } from 'vitest'
import { isValidPin } from './pin'

describe('isValidPin', () => {
  it('acepta el año de nacimiento correcto', () => {
    expect(isValidPin('1990', '1990-05-12')).toBe(true)
  })

  it('rechaza un año incorrecto', () => {
    expect(isValidPin('1991', '1990-05-12')).toBe(false)
  })

  it('rechaza cuando el empleado no tiene fecha de nacimiento registrada', () => {
    expect(isValidPin('1990', null)).toBe(false)
  })

  it('rechaza un pin que no son 4 digitos', () => {
    expect(isValidPin('99', '1990-05-12')).toBe(false)
    expect(isValidPin('19900', '1990-05-12')).toBe(false)
  })

  it('rechaza un pin con caracteres no numericos', () => {
    expect(isValidPin('199a', '1990-05-12')).toBe(false)
  })
})
