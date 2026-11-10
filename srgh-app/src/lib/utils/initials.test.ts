import { describe, expect, it } from 'vitest'
import { initialsOfEmail } from './initials'

describe('initialsOfEmail', () => {
  it('toma las dos primeras letras del correo, en mayúscula', () => {
    expect(initialsOfEmail('admin@empresa.com')).toBe('AD')
  })

  it('con un correo vacío devuelve un signo de pregunta', () => {
    expect(initialsOfEmail('')).toBe('?')
  })
})
