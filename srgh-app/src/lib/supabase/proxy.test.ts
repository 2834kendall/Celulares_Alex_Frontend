import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { updateSession } from './proxy'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'anon-key',
  },
}))

const mockCreateServerClient = vi.mocked(createServerClient)

function setupProxyClient(options: {
  claims?: Record<string, unknown> | null
  rpcResult?: { data: unknown; error: unknown }
  rpcRejects?: Error
}) {
  const getClaims = vi.fn().mockResolvedValue({
    data: options.claims ? { claims: options.claims } : null,
  })
  const rpc = options.rpcRejects
    ? vi.fn().mockRejectedValue(options.rpcRejects)
    : vi.fn().mockResolvedValue(options.rpcResult ?? { data: true, error: null })
  let setAllHandler:
    | ((cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void)
    | undefined

  const signOut = vi.fn(async () => {
    setAllHandler?.([
      {
        name: 'sb-auth-token',
        value: '',
        options: { path: '/', maxAge: 0 },
      },
    ])
    return { error: null }
  })

  mockCreateServerClient.mockImplementation((_url, _key, config) => {
    const cookiesAdapter = config.cookies as {
      setAll?: typeof setAllHandler
    }
    setAllHandler = cookiesAdapter.setAll
    return {
      auth: { getClaims, signOut },
      rpc,
    } as unknown as ReturnType<typeof createServerClient>
  })

  return { getClaims, rpc, signOut }
}

function makeRequest(pathname: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(`https://app.sgrh.cr${pathname}`)
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value)
  }
  return req
}

describe('updateSession (proxy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('usuario anónimo no consulta sgrh_sesion_vigente y respeta rutas públicas/privadas', async () => {
    const { rpc, signOut } = setupProxyClient({ claims: null })

    const resLogin = await updateSession(makeRequest('/login'))
    expect(resLogin.status).toBe(200)

    const resProtected = await updateSession(makeRequest('/dashboard'))
    expect(resProtected.status).toBe(307)
    expect(new URL(resProtected.headers.get('location')!).pathname).toBe('/login')

    const resRoot = await updateSession(makeRequest('/'))
    expect(new URL(resRoot.headers.get('location')!).pathname).toBe('/login')

    expect(rpc).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('usuario con sesión vigente mantiene redirecciones de / y /login, y kiosco se confina a /kiosco', async () => {
    setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN', empresa_id: 1 } },
      rpcResult: { data: true, error: null },
    })

    const resRoot = await updateSession(makeRequest('/'))
    expect(new URL(resRoot.headers.get('location')!).pathname).toBe('/dashboard')

    const resLogin = await updateSession(makeRequest('/login'))
    expect(new URL(resLogin.headers.get('location')!).pathname).toBe('/dashboard')

    const resDash = await updateSession(makeRequest('/dashboard'))
    expect(resDash.status).toBe(200)

    setupProxyClient({
      claims: { sub: 'k1', app_metadata: { rol: 'KIOSCO', empresa_id: 1 } },
      rpcResult: { data: true, error: null },
    })

    const resKioskRoot = await updateSession(makeRequest('/'))
    expect(new URL(resKioskRoot.headers.get('location')!).pathname).toBe('/kiosco')

    const resKioskEscape = await updateSession(makeRequest('/employees'))
    expect(new URL(resKioskEscape.headers.get('location')!).pathname).toBe('/kiosco')

    const resKioskOk = await updateSession(makeRequest('/kiosco'))
    expect(resKioskOk.status).toBe(200)
  })

  it('JWT no expirado con sgrh_sesion_vigente = false limpia cookies localmente y redirige a /login', async () => {
    const { rpc, signOut } = setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN', empresa_id: 1 } },
      rpcResult: { data: false, error: null },
    })

    const res = await updateSession(
      makeRequest('/employees', { 'sb-auth-token': 'stale-jwt-cookie' })
    )

    expect(rpc).toHaveBeenCalledWith('sgrh_sesion_vigente')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    expect(res.cookies.get('sb-auth-token')?.value).toBe('')
  })

  it('si sgrh_sesion_vigente devuelve error o rechaza, limpia cookies y expulsa a /login (fail-closed)', async () => {
    const first = setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN' } },
      rpcResult: { data: null, error: { message: 'db error' } },
    })
    const resError = await updateSession(makeRequest('/dashboard'))
    expect(first.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(new URL(resError.headers.get('location')!).pathname).toBe('/login')

    const second = setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN' } },
      rpcRejects: new Error('network down'),
    })
    const resReject = await updateSession(makeRequest('/dashboard'))
    expect(second.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(new URL(resReject.headers.get('location')!).pathname).toBe('/login')
  })

  it('usuario con JWT revocado entrando a /login limpia cookies y NO rebota a /dashboard (previene bucle)', async () => {
    const { signOut } = setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN', empresa_id: 1 } },
      rpcResult: { data: false, error: null },
    })

    const res = await updateSession(makeRequest('/login', { 'sb-auth-token': 'stale-jwt-cookie' }))

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.cookies.get('sb-auth-token')?.value).toBe('')
    expect(res.headers.get('x-middleware-request-cookie') ?? '').not.toContain('stale-jwt-cookie')
  })

  it('JWT revocado en ruta pública (/reset-password) limpia x-middleware-request-cookie para el SSR de este request', async () => {
    const { signOut } = setupProxyClient({
      claims: { sub: 'u1', app_metadata: { rol: 'ADMIN', empresa_id: 1 } },
      rpcResult: { data: false, error: null },
    })

    const res = await updateSession(
      makeRequest('/reset-password', { 'sb-auth-token': 'stale-jwt-cookie' })
    )

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(res.status).toBe(200)
    expect(res.cookies.get('sb-auth-token')?.value).toBe('')
    expect(res.headers.get('x-middleware-request-cookie') ?? '').not.toContain('stale-jwt-cookie')
  })

  it('cuenta KIOSCO con sesión revocada limpia cookies y redirige a /login en vez de quedar atrapada en /kiosco', async () => {
    const { signOut } = setupProxyClient({
      claims: { sub: 'k1', app_metadata: { rol: 'KIOSCO', empresa_id: 1 } },
      rpcResult: { data: false, error: null },
    })

    const res = await updateSession(
      makeRequest('/kiosco', { 'sb-auth-token': 'stale-kiosk-cookie' })
    )

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    expect(res.cookies.get('sb-auth-token')?.value).toBe('')
  })
})
