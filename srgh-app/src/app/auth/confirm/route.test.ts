import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockVerify(error: unknown = null) {
  const client = { auth: { verifyOtp: vi.fn(async () => ({ data: {}, error })) } }
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function request(query: string) {
  return new NextRequest(`http://localhost:3000/auth/confirm${query}`)
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifica el token y redirige a /activate-account sin exponer el token', async () => {
    const client = mockVerify()

    const response = await GET(request('?token_hash=abc123&type=invite'))

    expect(client.auth.verifyOtp).toHaveBeenCalledWith({ type: 'invite', token_hash: 'abc123' })
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/activate-account')
    expect(location.searchParams.get('token_hash')).toBeNull()
    expect(location.searchParams.get('type')).toBeNull()
  })

  it('respeta un next interno', async () => {
    mockVerify()

    const response = await GET(request('?token_hash=abc123&type=recovery&next=/profile'))

    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/profile')
    expect(location.searchParams.get('next')).toBeNull()
  })

  it('ignora un next externo (open redirect)', async () => {
    mockVerify()

    const response = await GET(
      request('?token_hash=abc123&type=invite&next=https://evil.example.com')
    )

    const location = new URL(response.headers.get('location')!)
    expect(location.origin).toBe('http://localhost:3000')
    expect(location.pathname).toBe('/activate-account')
  })

  it('sin token redirige a /activate-account sin llamar a Supabase', async () => {
    const response = await GET(request(''))

    expect(mockCreateClient).not.toHaveBeenCalled()
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/activate-account')
  })

  it('con token inválido redirige a /activate-account (estado de enlace vencido)', async () => {
    mockVerify({ message: 'expired' })

    const response = await GET(request('?token_hash=viejo&type=invite'))

    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/activate-account')
  })
})
