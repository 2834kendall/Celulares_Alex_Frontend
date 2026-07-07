import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login } from './login'
import { createClient } from '@/lib/supabase/server'
import type { LoginInput } from '@/modules/auth/types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface MockOptions {
  signInError?: { status?: number; code?: string; message: string } | null
  claims?: Record<string, unknown> | null
}

function mockSupabase({ signInError = null, claims = null }: MockOptions = {}) {
  const client = {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: signInError }),
      getClaims: vi.fn().mockResolvedValue({ data: claims ? { claims } : null }),
    },
  }
  mockCreateClient.mockResolvedValue(client as unknown as SupabaseServerClient)
  return client
}

const validInput: LoginInput = { email: 'user@mail.com', password: 'secreto' }

describe('login (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un payload invalido sin llamar a supabase', async () => {
    const client = mockSupabase()
    const result = await login({ email: 'invalido', password: '' })

    expect(result).toEqual({ ok: false, error: 'Datos de acceso invalidos.' })
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('redirige a /dashboard cuando el JWT trae permisos', async () => {
    const client = mockSupabase({
      claims: { app_metadata: { permisos: ['EMPLEADOS_READ'] } },
    })

    const result = await login(validInput)

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith(validInput)
    expect(result).toEqual({ ok: true, destination: '/dashboard' })
  })

  it('redirige a /unauthorized cuando el JWT trae permisos vacios', async () => {
    mockSupabase({ claims: { app_metadata: { permisos: [] } } })
    const result = await login(validInput)
    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  it('redirige a /unauthorized cuando permisos no es un array', async () => {
    mockSupabase({ claims: { app_metadata: { permisos: 'nope' } } })
    const result = await login(validInput)
    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  it('redirige a /unauthorized cuando no hay claims', async () => {
    mockSupabase({ claims: null })
    const result = await login(validInput)
    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  it('redirige a /unauthorized cuando los claims no traen app_metadata', async () => {
    mockSupabase({ claims: {} })
    const result = await login(validInput)
    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  describe('mensajes de error de autenticacion', () => {
    it.each([
      [
        { status: 429, message: 'x' },
        'Demasiados intentos. Espere un momento antes de volver a intentar.',
      ],
      [
        { code: 'over_request_rate_limit', message: 'x' },
        'Demasiados intentos. Espere un momento antes de volver a intentar.',
      ],
      [
        { code: 'email_not_confirmed', message: 'x' },
        'No se pudo completar el acceso. Confirme su correo o contacte al administrador.',
      ],
      [
        { message: 'Email not confirmed' },
        'No se pudo completar el acceso. Confirme su correo o contacte al administrador.',
      ],
      [
        { message: 'Failed to fetch' },
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.',
      ],
      [
        { message: 'network error occurred' },
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.',
      ],
      [{ message: 'Invalid login credentials' }, 'Credenciales invalidas.'],
    ])('mapea %o a "%s"', async (signInError, expected) => {
      mockSupabase({ signInError })
      const result = await login(validInput)
      expect(result).toEqual({ ok: false, error: expected })
    })
  })
})
