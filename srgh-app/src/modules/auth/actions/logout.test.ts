import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from './logout'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

const mockCreateClient = vi.mocked(createClient)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

describe('logout (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cierra la sesion y redirige a /login', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockResolvedValue({
      auth: { signOut },
    } as unknown as SupabaseServerClient)

    await expect(logout()).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(signOut).toHaveBeenCalledOnce()
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
