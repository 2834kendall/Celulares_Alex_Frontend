import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logout } from './logout'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// next/navigation NO se mockea a proposito. Si alguien vuelve a poner un
// redirect() en la accion, corre el de verdad, que lanza, y el primer test de
// abajo falla. Ese redirect fue un bug: Next le rechaza la promesa al cliente
// y el boton avisaba "no se pudo cerrar la sesion" mientras navegaba.

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const deleteCookie = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ delete: deleteCookie })),
}))

const mockCreateClient = vi.mocked(createClient)

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function clientCon(signOutResult: { error: unknown }) {
  const signOut = vi.fn().mockResolvedValue(signOutResult)
  mockCreateClient.mockResolvedValue({ auth: { signOut } } as unknown as SupabaseServerClient)
  return signOut
}

describe('logout (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cierra la sesion y DEVUELVE { ok: true } en vez de redirigir', async () => {
    const signOut = clientCon({ error: null })

    await expect(logout()).resolves.toEqual({ ok: true })

    expect(signOut).toHaveBeenCalledOnce()
  })

  it('invalida el Router Cache, para que Atras no muestre el dashboard', async () => {
    clientCon({ error: null })

    await logout()

    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('borra la cookie del dashboard, que lleva el id del usuario anterior', async () => {
    clientCon({ error: null })

    await logout()

    expect(cookies).toHaveBeenCalled()
    expect(deleteCookie).toHaveBeenCalledWith('sgrh-dashboard')
  })

  it('borra la marca elegida: la siguiente cuenta no hereda el filtro', async () => {
    clientCon({ error: null })

    await logout()

    expect(deleteCookie).toHaveBeenCalledWith('sgrh_marca_contexto')
  })

  it('si signOut falla, lo dice y NO finge que salio', async () => {
    // Antes el error se descartaba y se navegaba igual: la persona aterrizaba
    // en /login con las cookies todavia vivas.
    clientCon({ error: { message: 'network down' } })

    const result = await logout()

    expect(result).toEqual({
      ok: false,
      error: 'El servidor no pudo cerrar la sesión. Intente de nuevo en unos segundos.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(deleteCookie).not.toHaveBeenCalled()
  })
})
