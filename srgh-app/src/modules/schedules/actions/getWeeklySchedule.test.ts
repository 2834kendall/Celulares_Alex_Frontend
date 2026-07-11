import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWeeklySchedule } from './getWeeklySchedule'
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

describe('getWeeklySchedule (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar la empresa del usuario.',
    })
  })

  it('devuelve error si falla la carga del historial laboral', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('no consulta programacion cuando no hay colaboradores activos', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: true, weekDates: WEEK_DATES, data: [] })
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('sgrh_historial_laboral')
  })

  it('devuelve error si falla la carga de la programacion semanal', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: {
          data: [
            {
              lab_id: 1,
              lab_empleado_id: 10,
              lab_sucursal_id: 100,
              sgrh_empleados: { emp_id: 10, emp_nombre: 'Ana', emp_apellido_1: 'Perez' },
              sgrh_cat_puestos: { pue_nombre: 'Cajera' },
            },
          ],
          error: null,
        },
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la programacion semanal.' })
  })

  it('calcula horas y arma la matriz semanal en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: {
          data: [
            {
              lab_id: 1,
              lab_empleado_id: 10,
              lab_sucursal_id: 100,
              sgrh_empleados: {
                emp_id: 10,
                emp_nombre: 'Ana',
                emp_apellido_1: 'Perez',
                emp_apellido_2: null,
              },
              sgrh_cat_puestos: { pue_nombre: 'Cajera' },
            },
          ],
          error: null,
        },
        sgrh_programacion_semanal: {
          data: [
            {
              prg_id: 1,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-06',
              prg_es_dia_libre: false,
              prg_horario_id: 5,
              sgrh_cat_horarios: {
                hor_id: 5,
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
              prg_id: 2,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-07',
              prg_es_dia_libre: true,
              prg_horario_id: null,
              sgrh_cat_horarios: null,
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
            {
              prg_id: 3,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-08',
              prg_es_dia_libre: false,
              prg_horario_id: null,
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

    const result = await getWeeklySchedule(WEEK_START)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.weekDates).toEqual(WEEK_DATES)
    expect(result.data).toHaveLength(1)

    const row = result.data[0]
    expect(row.fullName).toBe('Ana Perez')
    expect(row.position).toBe('Cajera')
    expect(row.weeklyTotal).toBe(16.5)

    const [mon, tue, wed, thu] = row.days

    expect(mon).toMatchObject({ date: '2026-01-05', assignmentId: null, hours: 0, isDayOff: false })

    expect(tue).toMatchObject({
      date: '2026-01-06',
      assignmentId: 1,
      scheduleId: 5,
      scheduleName: 'Turno A',
      hours: 8,
      isDayOff: false,
    })

    expect(wed).toMatchObject({ date: '2026-01-07', assignmentId: 2, isDayOff: true, hours: 0 })

    expect(thu).toMatchObject({
      date: '2026-01-08',
      assignmentId: 3,
      isDayOff: false,
      hours: 8.5,
      customStartTime: '09:00:00',
      customEndTime: '18:00:00',
    })
  })
})
