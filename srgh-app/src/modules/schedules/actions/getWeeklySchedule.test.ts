import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWeeklySchedule } from './getWeeklySchedule'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'

vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))

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
        sgrh_sucursales: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('devuelve error si falla la carga de sucursales', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [], error: null },
        sgrh_sucursales: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar las sucursales.' })
  })

  it('no consulta programacion cuando no hay colaboradores activos', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [], error: null },
      sgrh_sucursales: { data: [{ suc_id: 100, suc_nombre: 'Central' }], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({
      ok: true,
      weekDates: WEEK_DATES,
      data: [],
      sucursales: [{ id: 100, nombre: 'Central' }],
    })
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(client.from).toHaveBeenCalledWith('sgrh_historial_laboral')
    expect(client.from).toHaveBeenCalledWith('sgrh_sucursales')
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
        sgrh_sucursales: { data: [], error: null },
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getWeeklySchedule(WEEK_START)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la programación semanal.' })
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
              sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
            },
          ],
          error: null,
        },
        sgrh_sucursales: {
          data: [
            { suc_id: 100, suc_nombre: 'Central' },
            { suc_id: 200, suc_nombre: 'Norte' },
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
              prg_sucursal_id: 100,
              sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
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
              prg_sucursal_id: 100,
              sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
              sgrh_cat_horarios: null,
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
            {
              // Este dia rota a la sucursal Norte, distinta de la de casa (Central).
              prg_id: 3,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-08',
              prg_es_dia_libre: false,
              prg_horario_id: null,
              prg_sucursal_id: 200,
              sgrh_sucursales: { suc_id: 200, suc_nombre: 'Norte' },
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
    expect(result.sucursales).toEqual([
      { id: 100, nombre: 'Central' },
      { id: 200, nombre: 'Norte' },
    ])

    const row = result.data[0]
    expect(row.fullName).toBe('Ana Perez')
    expect(row.position).toBe('Cajera')
    expect(row.weeklyTotal).toBe(16.5)
    expect(row.branchId).toBe(100)

    const [mon, tue, wed, thu] = row.days

    // Lunes sin fila propia: hereda la sucursal de casa del empleado.
    expect(mon).toMatchObject({
      date: '2026-01-05',
      assignmentId: null,
      hours: 0,
      isDayOff: false,
      branchId: 100,
      branchName: 'Central',
    })

    expect(tue).toMatchObject({
      date: '2026-01-06',
      assignmentId: 1,
      scheduleId: 5,
      scheduleName: 'Turno A',
      hours: 8,
      isDayOff: false,
      branchId: 100,
      branchName: 'Central',
    })

    expect(wed).toMatchObject({ date: '2026-01-07', assignmentId: 2, isDayOff: true, hours: 0 })

    // Jueves: rotacion a otra sucursal, la fila propia manda sobre la de casa.
    expect(thu).toMatchObject({
      date: '2026-01-08',
      assignmentId: 3,
      isDayOff: false,
      hours: 8.5,
      customStartTime: '09:00',
      customEndTime: '18:00',
      branchId: 200,
      branchName: 'Norte',
    })
  })

  it('el break paga los primeros 10 minutos: solo resta el exceso de las horas trabajadas', async () => {
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
        sgrh_sucursales: { data: [{ suc_id: 100, suc_nombre: 'Central' }], error: null },
        sgrh_programacion_semanal: {
          data: [
            {
              // Break de 20 min (08:00-08:20): resta solo 10 min de exceso.
              prg_id: 1,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-05',
              prg_es_dia_libre: false,
              prg_horario_id: 5,
              prg_sucursal_id: 100,
              sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
              sgrh_cat_horarios: {
                hor_id: 5,
                hor_nombre: 'Turno A',
                hor_hora_entrada: '08:00:00',
                hor_hora_salida: '17:00:00',
                hor_hora_inicio_almuerzo: '12:00:00',
                hor_hora_fin_almuerzo: '13:00:00',
                hor_hora_inicio_break: '08:00:00',
                hor_hora_fin_break: '08:20:00',
              },
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
              prg_hora_inicio_break_custom: null,
              prg_hora_fin_break_custom: null,
            },
            {
              // Break de 8 min (08:00-08:08): no resta nada.
              prg_id: 2,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-06',
              prg_es_dia_libre: false,
              prg_horario_id: 5,
              prg_sucursal_id: 100,
              sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
              sgrh_cat_horarios: {
                hor_id: 5,
                hor_nombre: 'Turno A',
                hor_hora_entrada: '08:00:00',
                hor_hora_salida: '17:00:00',
                hor_hora_inicio_almuerzo: '12:00:00',
                hor_hora_fin_almuerzo: '13:00:00',
                hor_hora_inicio_break: '08:00:00',
                hor_hora_fin_break: '08:08:00',
              },
              prg_hora_entrada_custom: null,
              prg_hora_salida_custom: null,
              prg_hora_inicio_almuerzo_custom: null,
              prg_hora_fin_almuerzo_custom: null,
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

    const [mon, tue] = result.data[0].days

    // 9h de jornada - 1h de almuerzo - 10min de exceso de break (20-10) = 7h50 => 7.83
    expect(mon.hours).toBeCloseTo(7.8333, 3)
    // 9h de jornada - 1h de almuerzo - 0min de break (8min < 10min pagados) = 8h
    expect(tue.hours).toBe(8)
  })
})

const FILTRO_MARCA = { estado: 'filtrado' as const, marcaId: 1, sucursalIds: [5, 6] }
const FILTRO_ERROR = { estado: 'error', sucursalIds: null } as const

describe('getWeeklySchedule con una marca elegida', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  const contrato = (id: number, sucursal: number) => ({
    lab_id: id,
    lab_empleado_id: id * 10,
    lab_sucursal_id: sucursal,
    sgrh_empleados: { emp_id: id * 10, emp_nombre: `Persona ${id}`, emp_apellido_1: 'Prueba' },
    sgrh_cat_puestos: null,
    sgrh_sucursales: { suc_id: sucursal, suc_nombre: `Tienda ${sucursal}` },
  })
  const turno = (labId: number, sucursal: number) => ({
    prg_id: labId,
    prg_historial_laboral_id: labId,
    prg_fecha: '2026-01-06',
    prg_es_dia_libre: true,
    prg_horario_id: null,
    prg_sucursal_id: sucursal,
    sgrh_sucursales: { suc_id: sucursal, suc_nombre: `Tienda ${sucursal}` },
    sgrh_cat_horarios: null,
  })
  const TIENDAS = [
    { suc_id: 5, suc_nombre: 'Tienda 5' },
    { suc_id: 9, suc_nombre: 'Tienda 9' },
  ]

  function conMatriz() {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: {
          data: [contrato(1, 5), contrato(2, 9), contrato(3, 9)],
          error: null,
        },
        sgrh_sucursales: { data: TIENDAS, error: null },
        // La 2 es de otra marca y cubre un turno en la 5; la 3 solo trabaja en la suya.
        sgrh_programacion_semanal: { data: [turno(2, 5), turno(3, 9)], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
  }

  it('muestra a quien tiene la base en la marca y a quien cubre un turno ahí', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    conMatriz()

    const result = await getWeeklySchedule(WEEK_START)

    expect(result.ok && result.data.map((r) => r.employmentHistoryId)).toEqual([1, 2])
  })

  it('la lista de tiendas sigue completa: se puede asignar en otra marca', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    conMatriz()

    const result = await getWeeklySchedule(WEEK_START)

    expect(result.ok && result.sucursales.map((s) => s.id)).toEqual([5, 9])
  })

  it('sin marca muestra a todos', async () => {
    conMatriz()

    const result = await getWeeklySchedule(WEEK_START)

    expect(result.ok && result.data).toHaveLength(3)
  })

  it('si no se pudo leer el filtro da error', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)

    expect((await getWeeklySchedule(WEEK_START)).ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})

describe('getWeeklySchedule con horas personalizadas', () => {
  it('las entrega sin segundos: las acciones de escritura exigen HH:mm', async () => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: {
          data: [
            {
              lab_id: 1,
              lab_empleado_id: 10,
              lab_sucursal_id: 5,
              sgrh_empleados: { emp_id: 10, emp_nombre: 'Ana', emp_apellido_1: 'Perez' },
              sgrh_cat_puestos: null,
              sgrh_sucursales: { suc_id: 5, suc_nombre: 'Centro' },
            },
          ],
          error: null,
        },
        sgrh_sucursales: { data: [{ suc_id: 5, suc_nombre: 'Centro' }], error: null },
        sgrh_programacion_semanal: {
          data: [
            {
              prg_id: 1,
              prg_historial_laboral_id: 1,
              prg_fecha: '2026-01-06',
              prg_es_dia_libre: false,
              prg_horario_id: null,
              prg_sucursal_id: 5,
              sgrh_sucursales: { suc_id: 5, suc_nombre: 'Centro' },
              sgrh_cat_horarios: null,
              // Asi las devuelve Postgres.
              prg_hora_entrada_custom: '08:00:00',
              prg_hora_salida_custom: '16:30:00',
              prg_hora_inicio_almuerzo_custom: '12:00:00',
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

    expect(result.ok && result.data[0].days[1]).toMatchObject({
      customStartTime: '08:00',
      customEndTime: '16:30',
      customLunchStart: '12:00',
      customLunchEnd: '13:00',
      customBreakStart: null,
      customBreakEnd: null,
    })
  })
})

describe('getWeeklySchedule con varios tramos en un dia (SGRH-110)', () => {
  const historial = {
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
    sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
  }

  const sucursales = {
    data: [
      { suc_id: 100, suc_nombre: 'Central' },
      { suc_id: 200, suc_nombre: 'Norte' },
    ],
    error: null,
  }

  /** Un tramo con horas propias, sin almuerzo ni receso. */
  const tramo = (
    id: number,
    fecha: string,
    sucursalId: number,
    entrada: string,
    salida: string
  ) => ({
    prg_id: id,
    prg_historial_laboral_id: 1,
    prg_fecha: fecha,
    prg_es_dia_libre: false,
    prg_horario_id: null,
    prg_sucursal_id: sucursalId,
    sgrh_sucursales: {
      suc_id: sucursalId,
      suc_nombre: sucursalId === 100 ? 'Central' : 'Norte',
    },
    sgrh_cat_horarios: null,
    prg_hora_entrada_custom: entrada,
    prg_hora_salida_custom: salida,
    prg_hora_inicio_almuerzo_custom: null,
    prg_hora_fin_almuerzo_custom: null,
    prg_hora_inicio_break_custom: null,
    prg_hora_fin_break_custom: null,
  })

  async function semana(filas: unknown[]) {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [historial], error: null },
        sgrh_sucursales: sucursales,
        sgrh_programacion_semanal: { data: filas, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    const result = await getWeeklySchedule(WEEK_START)
    if (!result.ok) throw new Error(result.error)
    return result.data[0]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('el primer tramo describe el dia y los demas van en extraTramos', async () => {
    const ana = await semana([
      tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00'),
      tramo(2, '2026-01-06', 200, '13:00:00', '17:00:00'),
    ])

    const martes = ana.days[1]

    expect(martes).toMatchObject({
      assignmentId: 1,
      branchId: 100,
      branchName: 'Central',
      startTime: '08:00:00',
      endTime: '12:00:00',
      hours: 4,
    })
    expect(martes.extraTramos).toHaveLength(1)
    expect(martes.extraTramos![0]).toMatchObject({
      date: '2026-01-06',
      assignmentId: 2,
      branchId: 200,
      branchName: 'Norte',
      startTime: '13:00:00',
      endTime: '17:00:00',
      customStartTime: '13:00',
      customEndTime: '17:00',
      hours: 4,
    })
  })

  it('el total semanal suma las horas de todos los tramos', async () => {
    const ana = await semana([
      tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00'),
      tramo(2, '2026-01-06', 200, '13:00:00', '17:00:00'),
      tramo(3, '2026-01-07', 100, '08:00:00', '16:00:00'),
    ])

    expect(ana.weeklyTotal).toBe(16)
  })

  it('ordena los tramos por hora de inicio, sin importar el orden en que lleguen', async () => {
    const ana = await semana([
      tramo(9, '2026-01-06', 200, '13:00:00', '17:00:00'),
      tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00'),
    ])

    expect(ana.days[1].assignmentId).toBe(1)
    expect(ana.days[1].extraTramos?.map((t) => t.assignmentId)).toEqual([9])
  })

  it('ordena con las horas de la plantilla cuando el tramo no es personalizado', async () => {
    const deLaPlantilla = {
      ...tramo(2, '2026-01-06', 200, '00:00:00', '00:00:00'),
      prg_horario_id: 7,
      prg_hora_entrada_custom: null,
      prg_hora_salida_custom: null,
      sgrh_cat_horarios: {
        hor_id: 7,
        hor_nombre: 'Tarde',
        hor_hora_entrada: '13:00:00',
        hor_hora_salida: '17:00:00',
        hor_hora_inicio_almuerzo: '15:00:00',
        hor_hora_fin_almuerzo: '15:00:00',
        hor_hora_inicio_break: null,
        hor_hora_fin_break: null,
      },
    }

    const ana = await semana([deLaPlantilla, tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00')])

    expect(ana.days[1].assignmentId).toBe(1)
    expect(ana.days[1].extraTramos?.[0]).toMatchObject({
      assignmentId: 2,
      scheduleId: 7,
      scheduleName: 'Tarde',
      startTime: '13:00:00',
    })
  })

  it('un dia con un solo tramo no trae extraTramos', async () => {
    const ana = await semana([tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00')])

    expect(ana.days[1]).not.toHaveProperty('extraTramos')
    expect(ana.days[0]).not.toHaveProperty('extraTramos')
  })

  it('quien trabaja un tramo en la marca elegida aparece aunque su base sea otra', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce({ estado: 'ok', sucursalIds: [200] } as never)

    const ana = await semana([
      tramo(1, '2026-01-06', 100, '08:00:00', '12:00:00'),
      tramo(2, '2026-01-06', 200, '13:00:00', '17:00:00'),
    ])

    // Ana tiene su base en Central (100), pero el segundo tramo es en Norte (200).
    expect(ana.employeeId).toBe(10)
    expect(ana.days[1].extraTramos).toHaveLength(1)
  })
})

describe('getWeeklySchedule con jornada partida (SGRH-110)', () => {
  const historial = {
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
    sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
  }

  const fila = (extra: Record<string, unknown> = {}) => ({
    prg_id: 1,
    prg_historial_laboral_id: 1,
    prg_fecha: '2026-01-06',
    prg_es_dia_libre: false,
    prg_horario_id: 8,
    prg_sucursal_id: 100,
    sgrh_sucursales: { suc_id: 100, suc_nombre: 'Central' },
    sgrh_cat_horarios: {
      hor_id: 8,
      hor_nombre: 'Partida',
      hor_hora_entrada: '07:00:00',
      hor_hora_salida: '11:00:00',
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

  async function semana(filas: unknown[]) {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [historial], error: null },
        sgrh_sucursales: { data: [{ suc_id: 100, suc_nombre: 'Central' }], error: null },
        sgrh_programacion_semanal: { data: filas, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )
    const result = await getWeeklySchedule(WEEK_START)
    if (!result.ok) throw new Error(result.error)
    return result.data[0]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('expone el segundo bloque, suma las dos partes y sigue siendo un solo tramo', async () => {
    const ana = await semana([fila()])

    expect(ana.days[1]).toMatchObject({
      scheduleId: 8,
      startTime: '07:00:00',
      endTime: '11:00:00',
      secondStartTime: '16:00:00',
      secondEndTime: '20:00:00',
      hours: 8,
    })
    expect(ana.days[1]).not.toHaveProperty('extraTramos')
    expect(ana.weeklyTotal).toBe(8)
  })

  it('con horas propias del dia no hay segundo bloque', async () => {
    const ana = await semana([
      fila({ prg_hora_entrada_custom: '09:00:00', prg_hora_salida_custom: '13:00:00' }),
    ])

    expect(ana.days[1]).toMatchObject({ secondStartTime: null, secondEndTime: null, hours: 4 })
  })

  it('un dia libre no trae segundo bloque ni horas', async () => {
    const ana = await semana([fila({ prg_es_dia_libre: true, sgrh_cat_horarios: null })])

    expect(ana.days[1]).toMatchObject({ isDayOff: true, secondStartTime: null, hours: 0 })
  })
})
