import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { DASHBOARD_PREFS_COOKIE, readDashboardPrefs } from './prefsCookie'
import { DEFAULT_PREFS } from './panels'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
const get = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(cookies).mockResolvedValue({ get } as unknown as Awaited<ReturnType<typeof cookies>>)
})
describe('dashboard layout cookie', () => {
  it('does not read another browser user layout without an identity', async () => {
    expect(await readDashboardPrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(cookies).not.toHaveBeenCalled()
  })
  it.each([
    undefined,
    '{broken',
    JSON.stringify({ u: 2, p: DEFAULT_PREFS }),
    JSON.stringify({ u: 1, p: { panels: 'invalid' } }),
  ])('falls back safely for absent, invalid or foreign layout %s', async (value) => {
    get.mockReturnValue(value === undefined ? undefined : { value })
    expect(await readDashboardPrefs(1)).toEqual(DEFAULT_PREFS)
    expect(get).toHaveBeenCalledWith(DASHBOARD_PREFS_COOKIE)
  })
  it('restores validated preferences only for their owner', async () => {
    const custom = { order: ['team', 'birthdays'], hidden: ['payroll'], sizes: { team: 6 } }
    get.mockReturnValue({ value: JSON.stringify({ u: 1, p: custom }) })
    expect(await readDashboardPrefs(1)).toEqual(custom)
    expect(await readDashboardPrefs(2)).toEqual(DEFAULT_PREFS)
  })
})
