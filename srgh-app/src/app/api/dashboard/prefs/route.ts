import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dashboardPrefsSchema } from '@/modules/dashboard/lib/panels'
import {
  DASHBOARD_PREFS_COOKIE,
  DASHBOARD_PREFS_MAX_AGE,
} from '@/modules/dashboard/lib/prefsCookie'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Saves how the signed-in person arranged their dashboard (see prefsCookie
 * for why it is a cookie). No permission beyond being signed in: it only
 * rearranges what that person already sees, and each panel keeps checking
 * its own permission when it loads.
 *
 * A route and not a Server Action on purpose: an action that writes a cookie
 * makes Next render the whole page again, and the dashboard is a dozen
 * queries. Reordering, resizing or hiding a panel needs none of that — the
 * board already applied the change — so the board asks for a new render
 * itself, and only when a panel has to be loaded.
 */
export async function POST(request: Request) {
  /* Only the app itself may call this: the session cookie travels with any
     request to this origin, whoever started it. */
  const origin = request.headers.get('origin')
  if (!origin || new URL(origin).host !== request.headers.get('host')) {
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 })
  }

  const parsed = dashboardPrefsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'La personalización no es válida.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: session } = await supabase.auth.getClaims()
  const usrId = ((session?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>).usr_id
  if (!usrId) {
    return NextResponse.json({ error: 'No se encontró la sesión del usuario.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(DASHBOARD_PREFS_COOKIE, JSON.stringify({ u: usrId, p: parsed.data }), {
    path: '/',
    maxAge: DASHBOARD_PREFS_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}
