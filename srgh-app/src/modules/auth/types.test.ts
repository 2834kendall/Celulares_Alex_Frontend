import { describe, expect, it } from 'vitest'
import {
  activateAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './types'

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

describe('activateAccountSchema', () => {
  it('acepta una contrasena valida confirmada', () => {
    const result = activateAccountSchema.safeParse({
      password: 'secreto123',
      confirmPassword: 'secreto123',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza contrasenas de menos de 8 caracteres', () => {
    const result = activateAccountSchema.safeParse({
      password: 'corta',
      confirmPassword: 'corta',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('La contraseña debe tener al menos 8 caracteres.')
    }
  })

  it('rechaza cuando la confirmacion no coincide', () => {
    const result = activateAccountSchema.safeParse({
      password: 'secreto123',
      confirmPassword: 'otra-cosa',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Las contraseñas no coinciden.')
      expect(result.error.issues[0].path).toEqual(['confirmPassword'])
    }
  })

  it('rechaza la confirmacion vacia', () => {
    const result = activateAccountSchema.safeParse({
      password: 'secreto123',
      confirmPassword: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Confirme su contraseña.')
    }
  })

  it('es el mismo esquema que resetPasswordSchema', () => {
    // Activar la cuenta invitada y restablecer la contraseña olvidada aplican
    // la misma politica; si esto deja de ser cierto hay que separarlos a
    // proposito, no por accidente.
    expect(resetPasswordSchema).toBe(activateAccountSchema)
  })
})

describe('forgotPasswordSchema', () => {
  it('acepta un correo valido', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'ana@empresa.com' })
    expect(result.success).toBe(true)
  })

  it('normaliza el correo: trim y minusculas', () => {
    const result = forgotPasswordSchema.parse({ email: '  ANA@EMPRESA.COM  ' })
    expect(result.email).toBe('ana@empresa.com')
  })

  it('rechaza un correo con formato invalido', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'no-es-correo' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Ingrese un correo electrónico válido.')
    }
  })

  it('rechaza el correo vacio con mensaje de requerido', () => {
    const result = forgotPasswordSchema.safeParse({ email: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El correo electrónico es requerido.')
    }
  })

  it('rechaza el correo ausente', () => {
    const result = forgotPasswordSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('El correo electrónico es requerido.')
    }
  })
})
