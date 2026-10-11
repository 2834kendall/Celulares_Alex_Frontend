import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pasteWeeklySchedule } from './pasteWeeklySchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { PasteWeeklyScheduleInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const baseInput: PasteWeeklyScheduleInput = {
  employees: [
    {
      employmentHistoryId: 1,
      employeeId: 2,
      days: [
        { assignmentId: null, date: '2026-01-05', branchId: 3, scheduleId: 4, isDayOff: false },
        // Este dia rota a otra sucursal — el caso de uso que motiva el cambio.
        { assignmentId: 10, date: '2026-01-06', branchId: 5, scheduleId: 4, isDayOff: false },
      ],
    },
  ],
}

describe('pasteWeeklySchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza una lista vacia de colaboradores sin llamar a requirePermission', async () => {
    const result = await pasteWeeklySchedule({ employees: [] })

    expect(result).toEqual({ ok: false, error: 'Datos invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('falla si no se pudo determinar la empresa del usuario', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('rechaza si alguna de las sucursales de los dias no es de la empresa', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        // Solo la sucursal 3 pertenece a la empresa; falta la 5 del segundo dia.
        sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
  })

  it('guarda cada dia con SU propia sucursal (rotacion) y revalida la ruta', async () => {
    const client = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')

    const calls = client.from.mock.calls
      .map((call, i) =>
        call[0] === 'sgrh_programacion_semanal' ? client.from.mock.results[i].value : null
      )
      .filter((v): v is NonNullable<typeof v> => v !== null)

    expect(calls[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ prg_sucursal_id: 3, prg_fecha: '2026-01-05' })
    )
    expect(calls[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ prg_sucursal_id: 5, prg_fecha: '2026-01-06' })
    )
  })

  it('un dia "sin asignar" en el origen borra la asignacion existente en destino', async () => {
    const client = createSupabaseClientMock({
      sgrh_sucursales: { data: [{ suc_id: 3 }], error: null },
      sgrh_programacion_semanal: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule({
      employees: [
        {
          employmentHistoryId: 1,
          employeeId: 2,
          days: [
            {
              assignmentId: 20,
              date: '2026-01-05',
              branchId: 3,
              scheduleId: null,
              isDayOff: false,
            },
          ],
        },
      ],
    })

    expect(result).toEqual({ ok: true })

    const deleteBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
    )!.value
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.eq).toHaveBeenCalledWith('prg_id', 20)
  })

  it('devuelve error generico si alguna escritura falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_sucursales: { data: [{ suc_id: 3 }, { suc_id: 5 }], error: null },
        sgrh_programacion_semanal: [
          { data: null, error: null },
          { data: null, error: { message: 'boom' } },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await pasteWeeklySchedule(baseInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo aplicar el horario en todos los dias.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
