import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { saveDashboardPrefs } from './savePrefs'

let save: typeof saveDashboardPrefs
const request = vi.fn()
const prefs = { order: [], hidden: [], sizes: {} }
beforeEach(async () => {
  vi.resetModules()
  request.mockReset()
  vi.stubGlobal('fetch', request)
  save = (await import('./savePrefs')).saveDashboardPrefs
})
afterEach(() => vi.unstubAllGlobals())

describe('dashboard preference save queue', () => {
  it('serializes saves so an older request cannot overwrite the latest layout', async () => {
    let finish!: (value: Response) => void
    request
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const first = save(prefs)
    const newer = { ...prefs, hidden: ['team' as const] }
    const second = save(newer)
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    finish(new Response('{}', { status: 200 }))
    expect(await first).toEqual({ ok: true })
    expect(await second).toEqual({ ok: true })
    expect(request).toHaveBeenNthCalledWith(2, '/api/dashboard/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newer),
    })
  })

  it('does not mistake a followed login redirect for a saved layout', async () => {
    const response = new Response('<html>Login</html>', { status: 200 })
    Object.defineProperty(response, 'redirected', { value: true })
    request.mockResolvedValue(response)
    expect(await save(prefs)).toEqual({
      ok: false,
      error: 'No se pudo guardar la personalización.',
    })
  })

  it('allows a later save after a network rejection without poisoning the queue', async () => {
    request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect((await save(prefs)).ok).toBe(false)
    expect(await save(prefs)).toEqual({ ok: true })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('returns an actionable server error without claiming success', async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Sesión vencida.' }), { status: 401 })
    )
    expect(await save(prefs)).toEqual({ ok: false, error: 'Sesión vencida.' })
  })

  it('handles a non-JSON gateway error without throwing or blocking the next save', async () => {
    request
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await save(prefs)).toEqual({
      ok: false,
      error: 'No se pudo guardar la personalización.',
    })
    expect(await save(prefs)).toEqual({ ok: true })
  })
})
