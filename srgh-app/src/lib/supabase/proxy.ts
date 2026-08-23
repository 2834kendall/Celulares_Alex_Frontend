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

  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const hasSession = !!claims

  // El rol decide el destino, no solo el hecho de tener sesion. KIOSCO es un
  // dispositivo compartido con sesion permanente: si aterriza en /dashboard
  // el AppShell se renderiza igual (DashboardLayout solo frena a quien tiene
  // CERO permisos, y KIOSCO tiene varios), y la tablet de la sucursal termina
  // mostrando el shell administrativo a cualquiera que pase.
  const meta = (claims?.app_metadata ?? {}) as { rol?: string }
  const isKiosk = meta.rol === 'KIOSCO'

  const { pathname } = request.nextUrl
  const isPublicPath =
    pathname === '/login' ||
    pathname === '/activate-account' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/auth/confirm' ||
    pathname === '/unauthorized'

  /** Repite las cookies refrescadas sobre la redireccion, o se pierde la sesion. */
  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  if (pathname === '/') {
    if (!hasSession) return redirectTo('/login')
    return redirectTo(isKiosk ? '/kiosco' : '/dashboard')
  }

  if (!hasSession && !isPublicPath) {
    return redirectTo('/login')
  }

  // Confinamiento del kiosco: la tablet solo existe para registrar marcas.
  // Cualquier otra ruta —el /dashboard al que la mandaba el rebote de abajo,
  // pero tambien /employees o /payroll escritos a mano— vuelve a /kiosco.
  //
  // Esto NO reemplaza a requirePermission en cada accion: es la capa que
  // evita que el shell administrativo llegue a pintarse en una pantalla
  // compartida. La autorizacion real sigue viviendo en RLS y en los guards
  // de cada Server Action.
  if (isKiosk && !pathname.startsWith('/kiosco')) {
    return redirectTo('/kiosco')
  }

  // Solo /login rebota con sesión: /activate-account, /reset-password y
  // /auth/confirm son parte de los flujos que llegan por correo, que
  // establecen la sesión ANTES de definir la contraseña —rebotarlos por
  // "tener sesión" seria rebotarlos justo cuando el flujo va bien—;
  // /forgot-password es inofensivo con sesión; y /unauthorized aplica
  // justo a usuarios con sesión sin permisos.
  if (hasSession && pathname === '/login') {
    return redirectTo('/dashboard')
  }

  return supabaseResponse
}
