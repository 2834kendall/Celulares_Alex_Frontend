import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMonthlyAttendanceSummary } from './getMonthlyAttendanceSummary'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { GetMonthlyAttendanceSummaryInput } from '@/modules/attendance/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: GetMonthlyAttendanceSummaryInput = { fecha: '2026-07-15' }

describe('getMonthlyAttendanceSummary (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 5 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await getMonthlyAttendanceSummary({ fecha: 'no-es-una-fecha' })

    expect(result).toEqual({ ok: false, error: 'Datos invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getMonthlyAttendanceSummary(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('calcula los limites del mes calendario a partir de cualquier fecha del mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary({ fecha: '2026-07-15' })

    expect(result).toEqual({ ok: true, start: '2026-07-01', end: '2026-07-31', data: [] })
  })

  it('separa tardias y ausencias en listas de fechas, ordenadas y con el detalle correcto', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_historial_laboral: {
        data: [
          {
            lab_id: 1,
            lab_empleado_id: 10,
            lab_sucursal_id: 100,
            sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
          },
        ],
        error: null,
      },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-10',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-02',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-05',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
        ],
        error: null,
      },
      sgrh_ausencias: { data: [], error: null },
      sgrh_marcas_asistencia: {
        data: [
          // 10 de julio: tardio (15 min tarde -> banda grave)
          {
            mar_id: 77,
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-10 08:15:00',
            mar_tardia_justificada: false,
            mar_tardia_justificacion: null,
          },
          // 2 de julio: a tiempo (no cuenta)
          {
            mar_id: 78,
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-02 08:00:00',
            mar_tardia_justificada: false,
            mar_tardia_justificacion: null,
          },
          // 5 de julio: sin marca -> ausente
        ],
        error: null,
      },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary(validInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toEqual({
      employeeId: 10,
      employmentHistoryId: 1,
      fullName: 'Ana Perez',
      tardias: 1,
      ausencias: 1,
      tardyDays: [
        {
          date: '2026-07-10',
          kind: 'entrada',
          time: '08:15',
          diffMinutes: 15,
          tipo: { nombre: 'Tardia grave', color: '#E11D48' },
          countsTowardWarning: true,
          markId: 77,
          isJustified: false,
          justification: null,
        },
      ],
      absentDays: ['2026-07-05'],
      justifiedAbsences: [],
    })
  })

  it('una tardanza justificada se lista pero no suma al conteo', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-10',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
        ],
        error: null,
      },
      sgrh_historial_laboral: {
        data: [
          {
            lab_id: 1,
            lab_empleado_id: 10,
            lab_sucursal_id: 100,
            sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
          },
        ],
        error: null,
      },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
      sgrh_marcas_asistencia: {
        data: [
          {
            mar_id: 90,
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-10 08:03:00',
            mar_tardia_justificada: true,
            mar_tardia_justificacion: 'El sistema estaba caido.',
          },
        ],
        error: null,
      },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary(validInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Sigue viendose el dia, con su banda y su motivo...
    expect(result.data[0].tardyDays).toEqual([
      {
        date: '2026-07-10',
        kind: 'entrada',
        time: '08:03',
        diffMinutes: 3,
        tipo: { nombre: 'Tardia leve', color: '#F59E0B' },
        countsTowardWarning: false,
        markId: 90,
        isJustified: true,
        justification: 'El sistema estaba caido.',
      },
    ])
    // ...pero no cuenta.
    expect(result.data[0].tardias).toBe(0)
  })

  it('ordena los empleados alfabeticamente', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
      sgrh_historial_laboral: {
        data: [
          {
            lab_id: 1,
            lab_empleado_id: 20,
            lab_sucursal_id: 100,
            sgrh_empleados: { emp_nombre: 'Zoe', emp_apellido_1: 'Ultimo', emp_apellido_2: null },
          },
          {
            lab_id: 2,
            lab_empleado_id: 10,
            lab_sucursal_id: 100,
            sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
          },
        ],
        error: null,
      },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_programacion_semanal: {
        data: [1, 2].map((prg_historial_laboral_id) => ({
          prg_historial_laboral_id,
          prg_sucursal_id: 100,
          prg_fecha: '2099-01-01',
          prg_es_dia_libre: false,
          prg_es_feriado: false,
          prg_hora_entrada_custom: null,
          sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
        })),
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary(validInput)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((d) => d.fullName)).toEqual(['Ana Perez', 'Zoe Ultimo'])
  })

  it('devuelve error generico si falla la reunion de datos del mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-01',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
        ],
        error: null,
      },
      sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })
  it('un dia sin marca cubierto por una ausencia aprobada sale como justificada, no como ausencia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_historial_laboral: {
        data: [
          {
            lab_id: 1,
            lab_empleado_id: 10,
            lab_sucursal_id: 100,
            sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
          },
        ],
        error: null,
      },
      sgrh_cat_tipos_tardia: { data: [], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_sucursal_id: 100,
            prg_fecha: '2026-07-05',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
        ],
        error: null,
      },
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2026-07-05',
            aus_fecha_fin: '2026-07-05',
            sgrh_cat_tipos_ausencia: { tau_nombre: 'Cita Médica' },
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getMonthlyAttendanceSummary(validInput)

    if (!result.ok) throw new Error('esperaba ok')
    expect(result.data[0].ausencias).toBe(0)
    expect(result.data[0].absentDays).toEqual([])
    expect(result.data[0].justifiedAbsences).toEqual([
      { date: '2026-07-05', tipoNombre: 'Cita Médica' },
    ])
  })
})
