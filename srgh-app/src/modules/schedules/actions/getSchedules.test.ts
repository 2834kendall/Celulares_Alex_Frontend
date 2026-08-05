import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSchedules } from './getSchedules'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ScheduleRow } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

describe('getSchedules (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('devuelve error generico si supabase falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getSchedules()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los horarios.' })
  })

  it('devuelve la lista de horarios en exito', async () => {
    const data = [{ hor_id: 1 }, { hor_id: 2 }] as unknown as ScheduleRow[]
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getSchedules()

    expect(result).toEqual({ ok: true, data })
    expect(mockRequirePermission).toHaveBeenCalled()
  })
})
