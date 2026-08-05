import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database.types'
import { env } from '@/lib/env'

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const hasSession = !!user

  const { pathname } = request.nextUrl
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/activate-account' ||
    pathname === '/auth/confirm' ||
    pathname === '/unauthorized'

  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = hasSession ? '/dashboard' : '/login'
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  // Solo /login rebota con sesión: /activate-account y /auth/confirm son parte
  // del flujo de invitación, que establece la sesión ANTES de definir la
  // contraseña; /unauthorized aplica justo a usuarios con sesión sin permisos.
  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  return supabaseResponse
}
