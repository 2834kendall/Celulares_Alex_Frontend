import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - models/ (ver abajo)
     * Feel free to modify this pattern to include more paths.
     *
     * `models/` son los pesos de MediaPipe y face-api que sirve /public. Tienen
     * que quedar FUERA del guard o el kiosco se rompe a si mismo: el
     * confinamiento de updateSession() manda a /kiosco todo lo que no empiece
     * con /kiosco, asi que el navegador pedia vision_wasm_internal.js y recibia
     * el HTML del kiosco — "Unexpected token '<'" y camara muerta.
     *
     * No expone nada: son modelos publicos (el bucket de Google y el repo de
     * @vladmandic/face-api). Los vectores faciales enrolados viven en la base
     * con RLS, nunca en /public.
     */
    '/((?!_next/static|_next/image|favicon.ico|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
