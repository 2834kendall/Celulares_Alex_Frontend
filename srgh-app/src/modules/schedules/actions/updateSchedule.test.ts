import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSchedule } from './updateSchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ScheduleInput } from '@/modules/schedules/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: ScheduleInput = {
  hor_nombre: 'Turno Diurno',
  hor_tipo_jornada_id: 1,
  hor_hora_entrada: '08:00',
  hor_hora_salida: '17:00',
  hor_hora_inicio_almuerzo: '12:00',
  hor_hora_fin_almuerzo: '13:00',
  hor_duracion_almuerzo_min: 60,
  hor_hora_inicio_break: '',
  hor_hora_fin_break: '',
  hor_duracion_break_min: 15,
  hor_activo: true,
}

describe('updateSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await updateSchedule(1, { ...validInput, hor_nombre: 'ab' })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('devuelve error generico si supabase falla al actualizar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: { message: 'not found' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSchedule(1, validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el horario.' })
  })

  it('actualiza el horario y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await updateSchedule(1, validInput)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
