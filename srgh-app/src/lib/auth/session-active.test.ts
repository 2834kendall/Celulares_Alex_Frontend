import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveSessionClaims, isSessionActive } from './session-active'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const mockCreateClient = vi.mocked(createClient)
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function mockSupabase(options: {
  claims?: Record<string, unknown> | null
  claimsError?: Error | null
  rpcResult?: { data: unknown; error: unknown }
  rpcRejects?: Error
}) {
  const getClaims = vi.fn().mockResolvedValue({
    data: options.claims ? { claims: options.claims } : null,
    error: options.claimsError ?? null,
  })
  const rpc = options.rpcRejects
    ? vi.fn().mockRejectedValue(options.rpcRejects)
    : vi.fn().mockResolvedValue(options.rpcResult ?? { data: true, error: null })

  mockCreateClient.mockResolvedValue({
    auth: { getClaims },
    rpc,
  } as unknown as SupabaseServerClient)

  return { getClaims, rpc }
}

describe('isSessionActive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve true solo cuando sgrh_sesion_vigente retorna true sin error', async () => {
    const { rpc } = mockSupabase({ rpcResult: { data: true, error: null } })

    await expect(isSessionActive()).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('sgrh_sesion_vigente')
  })

  it('devuelve false si sgrh_sesion_vigente retorna false o null (fail-closed)', async () => {
    mockSupabase({ rpcResult: { data: false, error: null } })
    await expect(isSessionActive()).resolves.toBe(false)

    mockSupabase({ rpcResult: { data: null, error: null } })
    await expect(isSessionActive()).resolves.toBe(false)
  })

  it('devuelve false si la RPC devuelve error o lanza una excepción', async () => {
    mockSupabase({ rpcResult: { data: true, error: { message: 'boom' } } })
    await expect(isSessionActive()).resolves.toBe(false)

    mockSupabase({ rpcRejects: new Error('network error') })
    await expect(isSessionActive()).resolves.toBe(false)
  })
})

describe('getActiveSessionClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve null sin llamar a sgrh_sesion_vigente cuando no hay claims o getClaims falla', async () => {
    const { rpc: rpcNoSession } = mockSupabase({ claims: null })
    await expect(getActiveSessionClaims()).resolves.toBeNull()
    expect(rpcNoSession).not.toHaveBeenCalled()

    const { rpc: rpcErr } = mockSupabase({
      claims: { sub: 'u1' },
      claimsError: new Error('invalid jwt'),
    })
    await expect(getActiveSessionClaims()).resolves.toBeNull()
    expect(rpcErr).not.toHaveBeenCalled()
  })

  it('devuelve null cuando hay claims pero la sesión está revocada/inactiva en BD', async () => {
    mockSupabase({
      claims: { sub: 'u1', app_metadata: { empresa_id: 1 } },
      rpcResult: { data: false, error: null },
    })

    await expect(getActiveSessionClaims()).resolves.toBeNull()
  })

  it('devuelve los claims cuando el JWT y la sesión en BD están vigentes', async () => {
    const claims = { sub: 'u1', app_metadata: { empresa_id: 1, permisos: ['EMPLEADOS_READ'] } }
    mockSupabase({ claims, rpcResult: { data: true, error: null } })

    await expect(getActiveSessionClaims()).resolves.toEqual(claims)
  })
})
