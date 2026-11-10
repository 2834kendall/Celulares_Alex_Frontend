import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDashboardAbsences,
  getDashboardEvaluations,
  getExpiringContracts,
  getMyAbsences,
  getMyEvaluations,
  getWeekSchedule,
} from './getDashboardExtras'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseQueryMock } from '@/test/supabaseMock'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'

vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

function setup(meta: Record<string, unknown> = {}, error: unknown = null) {
  const query = createSupabaseQueryMock({ data: [], error })
  const from = vi.fn(() => query)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { app_metadata: meta } } }) },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { query, from }
}
const today = '2026-11-06'

function withRows(rows: Record<string, unknown>, failedTable?: string) {
  const queries = new Map<string, ReturnType<typeof createSupabaseQueryMock>>()
  const from = vi.fn((table: string) => {
    const query = createSupabaseQueryMock({
      data: rows[table] ?? [],
      error: table === failedTable ? { message: 'unavailable' } : null,
    })
    queries.set(table, query)
    return query
  })
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            app_metadata: {
              empresa_id: 1,
              emp_id: 42,
              permisos: [
                'AUSENCIAS_READ',
                'EVALUACIONES_WRITE',
                'HORARIOS_WRITE',
                'EMPLEADOS_READ',
              ],
            },
          },
        },
      }),
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { from, queries }
}
const roster = [
  {
    lab_id: 1,
    lab_empleado_id: 42,
    lab_fecha_fin_programada: '2026-11-07',
    sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
    sgrh_cat_puestos: null,
    sgrh_sucursales: { suc_nombre: 'Centro' },
  },
  {
    lab_id: 2,
    lab_empleado_id: 43,
    lab_fecha_fin_programada: null,
    sgrh_empleados: { emp_nombre: 'Luis', emp_apellido_1: 'Mora', emp_apellido_2: null },
    sgrh_cat_puestos: null,
    sgrh_sucursales: null,
  },
  { lab_id: 3, lab_empleado_id: 44, sgrh_empleados: null },
]

describe('dashboard optional loaders authorization and failures', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    () => getDashboardAbsences(today),
    () => getDashboardEvaluations(today),
    () => getExpiringContracts(today),
    () => getWeekSchedule(today),
  ])('does not query protected panels without permission', async (load) => {
    const { from } = setup({ empresa_id: 1, permisos: [] })
    expect(await load()).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns empty personal panels without an employee identity', async () => {
    const { from } = setup({ empresa_id: 1, permisos: ['AUSENCIAS_READ', 'EVALUACIONES_READ'] })
    expect(await getMyAbsences(today)).toEqual({ pending: 0, absences: [] })
    expect(await getMyEvaluations()).toEqual({ evaluations: [], delta: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('filters personal absences by employee even with broad read permission', async () => {
    const { query } = setup({ empresa_id: 1, emp_id: 42, permisos: ['AUSENCIAS_READ'] })
    expect(await getMyAbsences(today)).toEqual({ pending: 0, absences: [] })
    expect(query.eq).toHaveBeenCalledWith('sgrh_historial_laboral.lab_empleado_id', 42)
    expect(query.gte).toHaveBeenCalledWith('aus_fecha_fin', '2026-10-07')
  })

  it('excludes evaluation drafts, bounds history and filters to the reader', async () => {
    const { query } = setup({ empresa_id: 1, emp_id: 42, permisos: ['EVALUACIONES_READ'] })
    await getMyEvaluations()
    expect(query.eq).toHaveBeenCalledWith('sgrh_historial_laboral.lab_empleado_id', 42)
    expect(query.neq).toHaveBeenCalledWith('eve_estado', 'borrador')
    expect(query.limit).toHaveBeenCalledWith(12)
    expect(query.order).toHaveBeenCalledWith('eve_fecha_evaluacion', { ascending: false })
  })

  it.each([() => getMyAbsences(today), () => getMyEvaluations()])(
    'represents personal query failure as unavailable, not empty',
    async (load) => {
      setup({ empresa_id: 1, emp_id: 42 }, { message: 'offline' })
      expect(await load()).toBeNull()
    }
  )

  it('filters active roster by company and stops when the roster fails', async () => {
    const { query, from } = setup(
      { empresa_id: 7, permisos: ['AUSENCIAS_READ'] },
      { message: 'offline' }
    )
    expect(await getDashboardAbsences(today)).toBeNull()
    expect(query.eq).toHaveBeenCalledWith('lab_empresa_id', 7)
    expect(query.is).toHaveBeenCalledWith('lab_fecha_fin', null)
    expect(from).not.toHaveBeenCalledWith('sgrh_ausencias')
  })

  it('counts only full-day absences of active people, with the actual week bounds', async () => {
    const { queries } = withRows({
      sgrh_historial_laboral: roster,
      sgrh_ausencias: [
        {
          aus_id: 1,
          aus_historial_laboral_id: 1,
          aus_fecha_inicio: today,
          aus_fecha_fin: today,
          sgrh_cat_tipos_ausencia: { tau_nombre: 'Vacaciones', tau_es_intradia: false },
        },
        {
          aus_id: 2,
          aus_historial_laboral_id: 2,
          aus_fecha_inicio: today,
          aus_fecha_fin: today,
          sgrh_cat_tipos_ausencia: { tau_nombre: 'Permiso', tau_es_intradia: true },
        },
        {
          aus_id: 3,
          aus_historial_laboral_id: 999,
          aus_fecha_inicio: today,
          aus_fecha_fin: today,
          sgrh_cat_tipos_ausencia: { tau_nombre: 'Vacaciones', tau_es_intradia: false },
        },
        { aus_id: 4, aus_historial_laboral_id: 1, sgrh_cat_tipos_ausencia: null },
      ],
    })
    const result = await getDashboardAbsences(today)
    expect(result?.outToday).toBe(1)
    expect(result?.absences.map((row) => row.id)).toEqual([1, 2])
    expect(queries.get('sgrh_ausencias')!.in).toHaveBeenCalledWith(
      'aus_historial_laboral_id',
      [1, 2]
    )
    expect(queries.get('sgrh_ausencias')!.eq).toHaveBeenCalledWith('aus_estado', 'aprobada')
    expect(queries.get('sgrh_ausencias')!.lte).toHaveBeenCalledWith(
      'aus_fecha_inicio',
      '2026-11-08'
    )
    expect(queries.get('sgrh_ausencias')!.gte).toHaveBeenCalledWith('aus_fecha_fin', '2026-11-02')
  })

  it('aggregates numeric evaluation scores and ignores contracts outside the roster', async () => {
    const { queries } = withRows({
      sgrh_historial_laboral: roster,
      sgrh_evaluaciones: [
        {
          eve_id: 1,
          eve_historial_laboral_id: 1,
          eve_fecha_evaluacion: today,
          eve_promedio_final: '8.5',
        },
        {
          eve_id: 2,
          eve_historial_laboral_id: 999,
          eve_fecha_evaluacion: today,
          eve_promedio_final: 10,
        },
        {
          eve_id: 3,
          eve_historial_laboral_id: null,
          eve_fecha_evaluacion: today,
          eve_promedio_final: null,
        },
      ],
    })
    expect(await getDashboardEvaluations(today)).toMatchObject({
      year: 2026,
      evaluated: 1,
      pending: 1,
      average: 8.5,
      pendingNames: ['Luis Mora'],
    })
    expect(queries.get('sgrh_evaluaciones')!.eq).toHaveBeenCalledWith('eve_empresa_id', 1)
    expect(queries.get('sgrh_evaluaciones')!.gte).toHaveBeenCalledWith(
      'eve_fecha_evaluacion',
      '2026-01-01'
    )
  })

  it('loads week staffing with write permission and excludes orphaned schedule rows', async () => {
    withRows({
      sgrh_historial_laboral: roster,
      sgrh_programacion_semanal: [
        { prg_historial_laboral_id: 1, prg_fecha: today, prg_es_dia_libre: false },
        { prg_historial_laboral_id: 999, prg_fecha: today, prg_es_dia_libre: false },
      ],
    })
    const result = await getWeekSchedule(today)
    expect(result).toMatchObject({ rosterSize: 2, unassigned: 1, unassignedNames: ['Luis Mora'] })
    expect(result?.days.find((day) => day.date === today)).toMatchObject({
      working: 1,
      off: 0,
      isToday: true,
    })
  })

  it('shows an expiring active contract with the joined employee and branch', async () => {
    withRows({ sgrh_historial_laboral: roster })
    expect(await getExpiringContracts(today)).toEqual([
      {
        labId: 1,
        employeeId: 42,
        nombre: 'Ana Perez',
        puesto: null,
        sucursal: 'Centro',
        dateLabel: '7 nov',
        daysLeft: 1,
      },
    ])
  })

  it.each([
    { table: 'sgrh_ausencias', load: () => getDashboardAbsences(today) },
    { table: 'sgrh_evaluaciones', load: () => getDashboardEvaluations(today) },
    { table: 'sgrh_programacion_semanal', load: () => getWeekSchedule(today) },
  ])(
    'does not present failed $table queries as successful empty summaries',
    async ({ table, load }) => {
      withRows({ sgrh_historial_laboral: roster }, table)
      expect(await load()).toBeNull()
    }
  )
})

const FILTRO_MARCA = { estado: 'filtrado' as const, marcaId: 1, sucursalIds: [5, 6] }
const FILTRO_ERROR = { estado: 'error', sucursalIds: null } as const

describe('dashboard roster with a chosen brand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('holds only the contracts of that brand', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_MARCA)
    const { queries } = withRows({ sgrh_historial_laboral: roster })

    await getExpiringContracts(today)

    expect(queries.get('sgrh_historial_laboral')?.in).toHaveBeenCalledWith(
      'lab_sucursal_id',
      [5, 6]
    )
  })

  it('does not narrow without a brand', async () => {
    const { queries } = withRows({ sgrh_historial_laboral: roster })

    await getExpiringContracts(today)

    expect(queries.get('sgrh_historial_laboral')?.in).not.toHaveBeenCalled()
  })

  it('the panel says it could not load when the filter could not be read', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce(FILTRO_ERROR)
    const { from } = withRows({ sgrh_historial_laboral: roster })

    expect(await getExpiringContracts(today)).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})
