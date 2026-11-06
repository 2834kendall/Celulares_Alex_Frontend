import { describe, expect, it, vi } from 'vitest'
import { SESSION_COOKIE_MAX_AGE_SECONDS, sessionCookieOptions } from './cookieOptions'

vi.mock('@supabase/ssr', () => ({ createBrowserClient: vi.fn(() => ({ fake: true })) }))
vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxx',
  },
}))

describe('sessionCookieOptions', () => {
  it('capa la vida de la cookie muy por debajo del default de la libreria', () => {
    // @supabase/ssr no fija maxAge, asi que la cookie `sb-*` termina viviendo
    // del orden de 400 dias. Lo que se afirma no es el numero exacto —ese se
    // puede ajustar— sino que SIGA siendo un tope corto: si alguien quita la
    // linea o la sube a un año, esto falla.
    const CIEN_DIAS_EN_SEGUNDOS = 60 * 60 * 24 * 100

    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(0)
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBeLessThan(CIEN_DIAS_EN_SEGUNDOS)
    expect(sessionCookieOptions.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS)
  })

  it('NO marca la cookie httpOnly, porque el cliente de navegador la lee', () => {
    // createBrowserClient tiene que leer esta cookie desde JavaScript.
    // Marcarla httpOnly la rompe en silencio: el servidor sigue andando y el
    // navegador deja de ver la sesion. Si alguien la agrega "por seguridad",
    // que se entere aca y no en produccion.
    expect(sessionCookieOptions).not.toHaveProperty('httpOnly')
  })

  it('mantiene sameSite lax y alcance de todo el sitio', () => {
    expect(sessionCookieOptions.sameSite).toBe('lax')
    expect(sessionCookieOptions.path).toBe('/')
  })

  it('el cliente de navegador las recibe de verdad', async () => {
    // client.ts era el unico de los tres sin objeto de opciones: habia que
    // crearlo. Si una refactorizacion lo vuelve a dejar con dos argumentos,
    // la cookie del navegador se crea con el default y nadie lo nota.
    const { createBrowserClient } = await import('@supabase/ssr')
    const { createClient } = await import('./client')

    createClient()

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://proyecto.supabase.co',
      'sb_publishable_xxx',
      { cookieOptions: sessionCookieOptions }
    )
  })
})
