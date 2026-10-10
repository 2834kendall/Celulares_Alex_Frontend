import 'server-only'
import { cookies } from 'next/headers'
import {
  DEFAULT_PREFS,
  dashboardPrefsSchema,
  type DashboardPrefs,
} from '@/modules/dashboard/lib/panels'

/**
 * Where the dashboard layout of each person is kept: a cookie.
 *
 * A cookie and not localStorage because the SERVER needs it: the page reads
 * it before loading anything, so a hidden panel is not even queried, and the
 * HTML that arrives already has the chosen layout (no rearranging after
 * hydration). And not the database because it is a personal, per-browser
 * convenience with nothing worth a migration: losing it only resets the
 * layout to the default.
 *
 * It is not sensitive (panel names and sizes), but it is still input written
 * by the browser: it is parsed with the schema and anything off falls back
 * to the default.
 */
export const DASHBOARD_PREFS_COOKIE = 'sgrh-dashboard'

/** A year: the layout is a habit, not a session. */
export const DASHBOARD_PREFS_MAX_AGE = 60 * 60 * 24 * 365

/**
 * The browser can be shared, so the cookie remembers WHOSE layout it holds:
 * read by someone else it is ignored, instead of handing them another
 * person's arrangement.
 */
export async function readDashboardPrefs(usrId: number | undefined): Promise<DashboardPrefs> {
  if (!usrId) return DEFAULT_PREFS

  const raw = (await cookies()).get(DASHBOARD_PREFS_COOKIE)?.value
  if (!raw) return DEFAULT_PREFS

  try {
    const stored = JSON.parse(raw) as { u?: unknown; p?: unknown }
    if (stored.u !== usrId) return DEFAULT_PREFS

    const parsed = dashboardPrefsSchema.safeParse(stored.p)
    return parsed.success ? parsed.data : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}
