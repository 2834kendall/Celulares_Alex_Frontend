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
              prg_sucursal_id: 100,
              sgrh_sucursales: { suc_nombre: 'Central' },
              sgrh_cat_horarios: {
                hor_id: 5,
                hor_nombre: 'Turno A',
                hor_color: '#3b82f6',
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
              prg_sucursal_id: 200,
              sgrh_sucursales: { suc_nombre: 'Norte' },
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
      scheduleId: 5,
      scheduleName: 'Turno A',
      scheduleColor: '#3b82f6',
      startTime: '08:00:00',
      endTime: '17:00:00',
      hours: 8,
      branchName: 'Central',
    })

    expect(wed).toMatchObject({ date: '2026-01-07', isDayOff: true, hours: 0 })

    expect(thu).toMatchObject({
      date: '2026-01-08',
      isHoliday: true,
      isCustom: true,
      startTime: '09:00:00',
      endTime: '18:00:00',
      hours: 8.5,
      observaciones: 'Feriado pagado doble',
      branchName: 'Norte',
    })

    expect(result.weeklyTotal).toBe(16.5)
  })
})

describe('getMySchedule con varios tramos en un dia (SGRH-110)', () => {
  const tramo = (fecha: string, sucursal: string, entrada: string, salida: string) => ({
    prg_fecha: fecha,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_observaciones: null,
    prg_sucursal_id: 1,
    sgrh_sucursales: { suc_nombre: sucursal },
    sgrh_cat_horarios: null,
    prg_hora_entrada_custom: entrada,
    prg_hora_salida_custom: salida,
    prg_hora_inicio_almuerzo_custom: null,
    prg_hora_fin_almuerzo_custom: null,
    prg_hora_inicio_break_custom: null,
    prg_hora_fin_break_custom: null,
  })

  async function miSemana(filas: unknown[]) {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: filas, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    const result = await getMySchedule(WEEK_START)
    if (!result.ok) throw new Error(result.error)
    return result
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { emp_id: 10 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('muestra el dia partido en dos tiendas: el primer tramo y el resto en extraTramos', async () => {
    const { days } = await miSemana([
      // Llegan en desorden: el de la tarde primero.
      tramo('2026-01-06', 'Alex', '13:00:00', '17:00:00'),
      tramo('2026-01-06', 'Infinity', '08:00:00', '12:00:00'),
    ])

    expect(days[1]).toMatchObject({
      date: '2026-01-06',
      branchName: 'Infinity',
      startTime: '08:00:00',
      endTime: '12:00:00',
      hours: 4,
    })
    expect(days[1].extraTramos).toHaveLength(1)
    expect(days[1].extraTramos![0]).toMatchObject({
      date: '2026-01-06',
      branchName: 'Alex',
      startTime: '13:00:00',
      endTime: '17:00:00',
      hours: 4,
    })
  })

  it('el total semanal suma las horas de los dos tramos', async () => {
    const { weeklyTotal } = await miSemana([
      tramo('2026-01-06', 'Infinity', '08:00:00', '12:00:00'),
      tramo('2026-01-06', 'Alex', '13:00:00', '17:00:00'),
      tramo('2026-01-07', 'Alex', '08:00:00', '16:00:00'),
    ])

    expect(weeklyTotal).toBe(16)
  })

  it('un dia con un solo tramo no trae extraTramos', async () => {
    const { days } = await miSemana([tramo('2026-01-06', 'Infinity', '08:00:00', '12:00:00')])

    expect(days[1]).not.toHaveProperty('extraTramos')
  })
})

describe('getMySchedule con jornada partida (SGRH-110)', () => {
  const plantillaPartida = (extra: Record<string, unknown> = {}) => ({
    prg_fecha: '2026-01-06',
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_observaciones: null,
    prg_sucursal_id: 1,
    sgrh_sucursales: { suc_nombre: 'Infinity' },
    sgrh_cat_horarios: {
      hor_id: 8,
      hor_nombre: 'Partida',
      hor_color: null,
      hor_hora_entrada: '07:00:00',
      hor_hora_salida: '11:00:00',
      // El hueco entre bloques viaja como almuerzo: no debe descontarse otra vez.
      hor_hora_inicio_almuerzo: '11:00:00',
      hor_hora_fin_almuerzo: '16:00:00',
      hor_hora_inicio_break: null,
      hor_hora_fin_break: null,
      hor_hora_entrada_2: '16:00:00',
      hor_hora_salida_2: '20:00:00',
    },
    prg_hora_entrada_custom: null,
    prg_hora_salida_custom: null,
    prg_hora_inicio_almuerzo_custom: null,
    prg_hora_fin_almuerzo_custom: null,
    prg_hora_inicio_break_custom: null,
    prg_hora_fin_break_custom: null,
    ...extra,
  })

  async function miSemana(filas: unknown[]) {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: filas, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    const result = await getMySchedule(WEEK_START)
    if (!result.ok) throw new Error(result.error)
    return result
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { emp_id: 10 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('expone los dos bloques y suma sus horas sin restar el hueco', async () => {
    const { days, weeklyTotal } = await miSemana([plantillaPartida()])

    expect(days[1]).toMatchObject({
      scheduleName: 'Partida',
      startTime: '07:00:00',
      endTime: '11:00:00',
      secondStartTime: '16:00:00',
      secondEndTime: '20:00:00',
      hours: 8,
    })
    expect(days[1]).not.toHaveProperty('extraTramos')
    expect(weeklyTotal).toBe(8)
  })

  it('una plantilla de un solo bloque trae el segundo bloque en null', async () => {
    const { days } = await miSemana([
      plantillaPartida({
        sgrh_cat_horarios: {
          hor_id: 5,
          hor_nombre: 'Turno A',
          hor_color: null,
          hor_hora_entrada: '08:00:00',
          hor_hora_salida: '17:00:00',
          hor_hora_inicio_almuerzo: '12:00:00',
          hor_hora_fin_almuerzo: '13:00:00',
          hor_hora_inicio_break: null,
          hor_hora_fin_break: null,
          hor_hora_entrada_2: null,
          hor_hora_salida_2: null,
        },
      }),
    ])

    expect(days[1]).toMatchObject({ secondStartTime: null, secondEndTime: null, hours: 8 })
  })

  it('las horas propias del dia mandan: no muestran el segundo bloque de la plantilla', async () => {
    const { days } = await miSemana([
      plantillaPartida({ prg_hora_entrada_custom: '09:00:00', prg_hora_salida_custom: '13:00:00' }),
    ])

    expect(days[1]).toMatchObject({
      isCustom: true,
      startTime: '09:00:00',
      endTime: '13:00:00',
      secondStartTime: null,
      secondEndTime: null,
      hours: 4,
    })
  })

  it('la jornada partida suma en el total junto con otro tramo del dia', async () => {
    const { weeklyTotal } = await miSemana([
      plantillaPartida(),
      plantillaPartida({
        sgrh_sucursales: { suc_nombre: 'Alex' },
        sgrh_cat_horarios: null,
        prg_hora_entrada_custom: '12:00:00',
        prg_hora_salida_custom: '15:00:00',
      }),
    ])

    expect(weeklyTotal).toBe(11)
  })
})
