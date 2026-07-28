import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignCustomScheduleBulk } from './assignCustomScheduleBulk'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { AssignCustomScheduleBulkInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: AssignCustomScheduleBulkInput = {
  employmentHistoryId: 1,
  employeeId: 2,
  branchId: 3,
  days: [
    { assignmentId: null, date: '2026-01-05' },
    { assignmentId: 10, date: '2026-01-06' },
  ],
  customStartTime: '08:00',
  customEndTime: '17:00',
  customLunchStart: null,
  customLunchEnd: null,
  customBreakStart: null,
  customBreakEnd: null,
}

describe('assignCustomScheduleBulk (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza una lista vacia de dias sin llamar a requirePermission', async () => {
    const result = await assignCustomScheduleBulk({ ...baseInput, days: [] })

    expect(result).toEqual({ ok: false, error: 'Datos de asignacion invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza horas donde la salida no es posterior a la entrada', async () => {
    const result = await assignCustomScheduleBulk({
      ...baseInput,
      customStartTime: '17:00',
      customEndTime: '08:00',
    })

    expect(result).toEqual({
      ok: false,
      error: 'La hora de salida debe ser posterior a la hora de entrada.',
    })
  })

  it('guarda todos los dias marcados y revalida la ruta en exito', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await assignCustomScheduleBulk(baseInput)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })

  it('devuelve error si alguno de los dias falla al guardar', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: [
        { data: null, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await assignCustomScheduleBulk(baseInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo guardar la asignacion en todos los dias.',
    })
  })
})
