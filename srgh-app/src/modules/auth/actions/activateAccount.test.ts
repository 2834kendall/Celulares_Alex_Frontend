import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateAccount } from './activateAccount'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

const VALID_INPUT = { password: 'secreto123', confirmPassword: 'secreto123' }

function mockAuth({
  claims = { app_metadata: { permisos: ['EMPLEADOS_READ'] } } as unknown,
  updateError = null as unknown,
} = {}) {
  const client = {
    auth: {
      getClaims: vi.fn(async () => ({ data: claims ? { claims } : null })),
      updateUser: vi.fn(async () => ({ data: {}, error: updateError })),
    },
  }
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('activateAccount (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza input inválido antes de tocar la sesión', async () => {
    const result = await activateAccount({ password: 'corta', confirmPassword: 'corta' })

    expect(result).toEqual({ ok: false, error: 'Datos de activación inválidos.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('avisa cuando el enlace no dejó sesión (expirado)', async () => {
    const client = mockAuth({ claims: null })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'El enlace de activación expiró. Solicite que le reenvíen la invitación.',
    })
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })

  it('guarda la contraseña y manda al dashboard con permisos', async () => {
    const client = mockAuth()

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({ ok: true, destination: '/dashboard' })
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'secreto123' })
  })

  it('manda a /unauthorized cuando el JWT no trae permisos', async () => {
    mockAuth({ claims: { app_metadata: {} } })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  it('tolera un JWT sin app_metadata', async () => {
    mockAuth({ claims: {} })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({ ok: true, destination: '/unauthorized' })
  })

  it('mapea el error de contraseña igual a la anterior', async () => {
    mockAuth({
      updateError: { code: 'same_password', message: 'New password should be different.' },
    })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'La nueva contraseña debe ser distinta a la anterior.',
    })
  })

  it('mapea el error de contraseña débil', async () => {
    mockAuth({ updateError: { code: 'weak_password', message: 'Password is too weak' } })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'La contraseña es demasiado débil. Use una combinación más segura.',
    })
  })

  it('devuelve error genérico ante cualquier otro fallo', async () => {
    mockAuth({ updateError: { code: 'other', message: 'boom' } })

    const result = await activateAccount(VALID_INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo guardar la contraseña. Intente de nuevo.',
    })
  })
})
