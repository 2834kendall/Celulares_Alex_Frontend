import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login } from './login'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'
import type { LoginInput } from '@/modules/auth/types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

function mockKioskLookup(result: { data: unknown; error: unknown }) {
  const admin = createSupabaseAdminClientMock({ sgrh_kioscos: result })
  vi.mocked(createAdminClient).mockReturnValue(
    admin as unknown as ReturnType<typeof createAdminClient>
  )
  return admin
}

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
    const result = await login({ email: 'invalido@', password: '' })

    expect(result).toEqual({ ok: false, error: 'Datos de acceso invalidos.' })
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('no consulta kioscos cuando se escribe un correo', async () => {
    mockSupabase({ claims: { app_metadata: { permisos: ['EMPLEADOS_READ'] } } })
    await login(validInput)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  describe('usuario de kiosco (SGRH-111)', () => {
    it('traduce el usuario al correo interno del kiosco y lo manda a /kiosco', async () => {
      const admin = mockKioskLookup({
        data: { kio_email: 'kiosk-1@kiosk.sgrh.internal' },
        error: null,
      })
      const client = mockSupabase({
        claims: { app_metadata: { rol: 'KIOSCO', permisos: ['ASISTENCIA_KIOSCO'] } },
      })

      const result = await login({ email: 'Centro-Caja1', password: 'secreto' })

      expect(admin.from).toHaveBeenCalledWith('sgrh_kioscos')
      expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'kiosk-1@kiosk.sgrh.internal',
        password: 'secreto',
      })
      expect(result).toEqual({ ok: true, destination: '/kiosco' })
    })

    it('responde como credenciales invalidas si el usuario no existe', async () => {
      mockKioskLookup({ data: null, error: null })
      const client = mockSupabase()

      const result = await login({ email: 'nadie', password: 'secreto' })

      expect(result).toEqual({ ok: false, error: 'Credenciales invalidas.' })
      expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    it('informa un problema de conexion si la busqueda falla', async () => {
      mockKioskLookup({ data: null, error: { message: 'unavailable' } })
      const client = mockSupabase()

      const result = await login({ email: 'caja1', password: 'secreto' })

      expect(result).toEqual({
        ok: false,
        error:
          'No se pudo conectar con el servicio de autenticación. Revise la conexión e intente de nuevo.',
      })
      expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
    })
  })

  it('redirige a /dashboard cuando el JWT trae permisos', async () => {
    const client = mockSupabase({
      claims: { app_metadata: { permisos: ['EMPLEADOS_READ'] } },
    })

    const result = await login(validInput)

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith(validInput)
    expect(result).toEqual({ ok: true, destination: '/dashboard' })
  })

  it('redirige a /kiosco cuando el rol del JWT es KIOSCO, aunque tenga permisos de dashboard', async () => {
    mockSupabase({
      claims: {
        app_metadata: { rol: 'KIOSCO', permisos: ['EMPLEADOS_READ', 'ASISTENCIA_WRITE'] },
      },
    })

    const result = await login(validInput)

    expect(result).toEqual({ ok: true, destination: '/kiosco' })
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
        'No se pudo conectar con el servicio de autenticación. Revise la conexión e intente de nuevo.',
      ],
      [
        { message: 'network error occurred' },
        'No se pudo conectar con el servicio de autenticación. Revise la conexión e intente de nuevo.',
      ],
      [{ message: 'Invalid login credentials' }, 'Credenciales invalidas.'],
    ])('mapea %o a "%s"', async (signInError, expected) => {
      mockSupabase({ signInError })
      const result = await login(validInput)
      expect(result).toEqual({ ok: false, error: expected })
    })
  })
})
