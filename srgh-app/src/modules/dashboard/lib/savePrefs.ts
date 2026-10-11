import type { DashboardPrefs } from '@/modules/dashboard/lib/panels'

export type SaveDashboardPrefsResult = { ok: true } | { ok: false; error: string }

const SAVE_ERROR = 'No se pudo guardar la personalización.'

/* Saves go out one at a time, in the order they were made: two requests in
   flight could land swapped and leave the older arrangement saved. */
let queue: Promise<unknown> = Promise.resolve()

/** Saves the arrangement of the dashboard (see api/dashboard/prefs). */
export function saveDashboardPrefs(prefs: DashboardPrefs): Promise<SaveDashboardPrefsResult> {
  const result = queue.then(async (): Promise<SaveDashboardPrefsResult> => {
    try {
      const response = await fetch('/api/dashboard/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      /* Without a session the proxy answers with a redirect to /login, which
         fetch follows to a page that loads fine: that is not a save. */
      if (response.ok && !response.redirected) return { ok: true }
      if (response.redirected) return { ok: false, error: SAVE_ERROR }

      const body = (await response.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: body?.error ?? SAVE_ERROR }
    } catch {
      return { ok: false, error: SAVE_ERROR }
    }
  })

  queue = result
  return result
}
