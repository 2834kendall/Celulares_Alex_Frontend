import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSchedule } from './createSchedule'
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

describe('createSchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin llamar a supabase ni requirePermission', async () => {
    const result = await createSchedule({ ...validInput, hor_nombre: 'ab' })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza cuando la hora de salida no es posterior a la de entrada', async () => {
    const result = await createSchedule({
      ...validInput,
      hor_hora_entrada: '17:00',
      hor_hora_salida: '08:00',
    })

    expect(result).toEqual({ ok: false, error: 'Datos de horario invalidos.' })
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await createSchedule(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: null, error: { message: 'duplicate key' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createSchedule(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo crear el horario.' })
  })

  it('crea el horario y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_horarios: { data: { hor_id: 42 }, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await createSchedule(validInput)

    expect(result).toEqual({ ok: true, id: 42 })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
