import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMySchedule } from './getMySchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const WEEK_START = '2026-01-05'
const WEEK_DATES = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
]

describe('getMySchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { emp_id: 10 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('falla si la cuenta no esta vinculada a un empleado (emp_id null)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { emp_id: null },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getMySchedule(WEEK_START)

    expect(result).toEqual({
      ok: false,
      error: 'Tu cuenta todavía no está vinculada a un expediente de empleado.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la consulta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar tu horario.' })
  })

  it('semana vacia: 7 dias sin asignacion, total en 0', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMySchedule(WEEK_START)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.weekDates).toEqual(WEEK_DATES)
    expect(result.days).toHaveLength(7)
    expect(result.days.every((d) => d.hours === 0 && d.scheduleName === null)).toBe(true)
    expect(result.weeklyTotal).toBe(0)
  })

  it('arma los dias con horario de catalogo, dia libre y horario personalizado', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: {
          data: [
            {
              prg_fecha: '2026-01-06',
              prg_es_dia_libre: false,
              prg_es_feriado: false,
              prg_observaciones: null,
              sgrh_cat_horarios: {
                hor_nombre: 'Turno A',
                hor_hora_entrada: '08:00:00',
                hor_hora_salida: '17:00:00',
                hor_hora_inicio_almuerzo: '12:00:00',
                hor_hora_fin_almuerzo: '13:00:00',
                hor_hora_inicio_break: null,
                hor_hora_fin_break: null,
              },
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
            {
              prg_fecha: '2026-01-07',
              prg_es_dia_libre: true,
              prg_es_feriado: false,
              prg_observaciones: null,
              sgrh_cat_horarios: null,
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
            {
              prg_fecha: '2026-01-08',
              prg_es_dia_libre: false,
              prg_es_feriado: true,
              prg_observaciones: 'Feriado pagado doble',
              sgrh_cat_horarios: null,
              prg_hora_entrada_custom: '09:00:00',
              prg_hora_salida_custom: '18:00:00',
              prg_hora_inicio_almuerzo_custom: '12:30:00',
              prg_hora_fin_almuerzo_custom: '13:00:00',
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMySchedule(WEEK_START)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [mon, tue, wed, thu] = result.days

    expect(mon).toMatchObject({ date: '2026-01-05', hours: 0, scheduleName: null })

    expect(tue).toMatchObject({
      date: '2026-01-06',
      isDayOff: false,
      scheduleName: 'Turno A',
      startTime: '08:00:00',
      endTime: '17:00:00',
      hours: 8,
    })

    expect(wed).toMatchObject({ date: '2026-01-07', isDayOff: true, hours: 0 })

    expect(thu).toMatchObject({
      date: '2026-01-08',
      isHoliday: true,
      startTime: '09:00:00',
      endTime: '18:00:00',
      hours: 8.5,
      observaciones: 'Feriado pagado doble',
    })

    expect(result.weeklyTotal).toBe(16.5)
  })
})
