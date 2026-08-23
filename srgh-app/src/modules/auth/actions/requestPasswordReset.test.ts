import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPasswordReset } from './requestPasswordReset'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockReset(error: unknown = null) {
  const client = {
    auth: {
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error })),
    },
  }
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('requestPasswordReset (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un correo inválido antes de tocar Supabase', async () => {
    const result = await requestPasswordReset({ email: 'no-es-correo' })

    expect(result).toEqual({ ok: false, error: 'Ingrese un correo electrónico válido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('envía el enlace con el correo normalizado', async () => {
    const client = mockReset()

    const result = await requestPasswordReset({ email: '  ANA@EMPRESA.COM  ' })

    expect(result).toEqual({ ok: true })
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@empresa.com')
  })

  it('NO pasa redirectTo: la URL la arma la plantilla con {{ .SiteURL }}', async () => {
    const client = mockReset()

    await requestPasswordReset({ email: 'ana@empresa.com' })

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@empresa.com')
    expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything()
    )
  })

  it('responde ok ante un correo que no existe (anti-enumeración)', async () => {
    mockReset({ code: 'user_not_found', message: 'User not found', status: 400 })

    const result = await requestPasswordReset({ email: 'nadie@empresa.com' })

    // Idéntico al camino feliz: el formulario es público y no puede servir
    // para averiguar qué correos tienen cuenta.
    expect(result).toEqual({ ok: true })
  })

  it('avisa cuando se supera el límite de envíos (status 429)', async () => {
    mockReset({ code: 'other', message: 'Too many requests', status: 429 })

    const result = await requestPasswordReset({ email: 'ana@empresa.com' })

    expect(result).toEqual({
      ok: false,
      error: 'Demasiadas solicitudes. Espere unos minutos antes de volver a intentar.',
    })
  })

  it('avisa cuando se supera el límite de envíos (código de Supabase)', async () => {
    mockReset({ code: 'over_email_send_rate_limit', message: 'rate limit exceeded' })

    const result = await requestPasswordReset({ email: 'ana@empresa.com' })

    expect(result).toEqual({
      ok: false,
      error: 'Demasiadas solicitudes. Espere unos minutos antes de volver a intentar.',
    })
  })

  it('reporta la caída de red en vez de callarla', async () => {
    mockReset({ code: 'unknown', message: 'Failed to fetch' })

    const result = await requestPasswordReset({ email: 'ana@empresa.com' })

    expect(result).toEqual({
      ok: false,
      error:
        'No se pudo conectar con el servicio de autenticacion. Revise la conexion e intente de nuevo.',
    })
  })
})
