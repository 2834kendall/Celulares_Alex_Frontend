'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dashboardPrefsSchema, type DashboardPrefs } from '@/modules/dashboard/lib/panels'
import {
  DASHBOARD_PREFS_COOKIE,
  DASHBOARD_PREFS_MAX_AGE,
} from '@/modules/dashboard/lib/prefsCookie'
import type { SgrhJwtClaims } from '@/types/auth'

export type SaveDashboardPrefsResult = { ok: true } | { ok: false; error: string }

/**
 * Saves how the signed-in person arranged their dashboard (see prefsCookie
 * for why it is a cookie). No permission beyond being signed in: it only
 * rearranges what that person already sees, and each panel keeps checking
 * its own permission when it loads.
 */
export async function saveDashboardPrefs(prefs: DashboardPrefs): Promise<SaveDashboardPrefsResult> {
  const parsed = dashboardPrefsSchema.safeParse(prefs)
  if (!parsed.success) {
    return { ok: false, error: 'La personalización no es válida.' }
  }

  const supabase = await createClient()
  const { data: session } = await supabase.auth.getClaims()
  const usrId = ((session?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>).usr_id
  if (!usrId) {
    return { ok: false, error: 'No se encontró la sesión del usuario.' }
  }

  ;(await cookies()).set(DASHBOARD_PREFS_COOKIE, JSON.stringify({ u: usrId, p: parsed.data }), {
    path: '/',
    maxAge: DASHBOARD_PREFS_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  /* A panel that was hidden has to be loaded now: the page renders again. */
  revalidatePath('/dashboard')
  return { ok: true }
}
