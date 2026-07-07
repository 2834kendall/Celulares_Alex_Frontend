import { describe, expect, it } from 'vitest'
import { loginSchema } from './types'

describe('loginSchema', () => {
  it('acepta credenciales validas', () => {
    const result = loginSchema.safeParse({ email: 'user@mail.com', password: 'secreto' })
    expect(result.success).toBe(true)
  })

  it('normaliza el correo: trim y minusculas', () => {
    const result = loginSchema.parse({ email: '  USER@MAIL.COM  ', password: 'x' })
    expect(result.email).toBe('user@mail.com')
  })

  it('rechaza un correo con formato invalido', () => {
    const result = loginSchema.safeParse({ email: 'no-es-correo', password: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Ingrese un correo electrónico válido.')
    }
  })

  it('rechaza el correo vacio con mensaje de requerido', () => {
    const result = loginSchema.safeParse({ email: '   ', password: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El correo electrónico es requerido.')
    }
  })

  it('rechaza el correo ausente', () => {
    const result = loginSchema.safeParse({ password: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El correo electrónico es requerido.')
    }
  })

  it('rechaza la contrasena vacia', () => {
    const result = loginSchema.safeParse({ email: 'user@mail.com', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Ingrese su contraseña.')
    }
  })

  it('rechaza la contrasena ausente', () => {
    const result = loginSchema.safeParse({ email: 'user@mail.com' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('La contraseña es requerida.')
    }
  })
})
