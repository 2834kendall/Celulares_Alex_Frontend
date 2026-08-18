import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatherMonthlyAttendanceDays } from './monthlySummary'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

describe('gatherMonthlyAttendanceDays', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve vacio y no consulta el resto si no hay colaboradores', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      sgrh_historial_laboral: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: true, data: [] })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_sucursales')
  })

  it('no consulta la sucursal fija si no hay usuarioId', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [], error: null },
    })

    await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      undefined,
      '2026-07-01',
      '2026-07-31'
    )

    expect(client.from).not.toHaveBeenCalledWith('sgrh_usuarios_empresa_rol')
  })

  it('devuelve error si falla la carga de colaboradores', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('junta nombre, tolerancia y hora real de entrada por dia, con la fecha, filtrando por la sucursal fija del usuario', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
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
      sgrh_sucursales: {
        data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }],
        error: null,
      },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2026-07-01',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: {
        data: [
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-01T08:20:00',
          },
        ],
        error: null,
      },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [
        {
          employeeId: 10,
          employmentHistoryId: 1,
          fullName: 'Ana Perez',
          days: [
            {
              date: '2026-07-01',
              isJustifiedAbsence: false,
              isDayOff: false,
              isHoliday: false,
              expectedStart: '08:00',
              entradaTime: '08:20',
              toleranciaMinutos: 5,
            },
          ],
        },
      ],
    })

    const historialCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_historial_laboral'
    )!.value
    expect(historialCall.eq).toHaveBeenCalledWith('lab_sucursal_id', 100)
  })

  it('ignora dias futuros: un horario ya asignado para manana no cuenta como ausencia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
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
      sgrh_sucursales: { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null },
      sgrh_programacion_semanal: {
        // Fecha bien en el futuro respecto a "hoy" real — sin marca posible.
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2099-01-01',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2099-01-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Ana Perez', days: [] }],
    })
  })

  it('el turno de HOY que todavia no llega a su hora+tolerancia no cuenta como ausencia', async () => {
    // "Ahora" en Costa Rica: 31-jul 08:05 a. m. — el turno empieza a las 11am.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T14:05:00.000Z')) // 08:05 CR (UTC-6)

    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
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
      sgrh_sucursales: { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2026-07-31',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Ana Perez', days: [] }],
    })
  })

  it('el turno de HOY ya vencido (hora+tolerancia pasada) sin marca si cuenta como ausencia', async () => {
    // "Ahora" en Costa Rica: 31-jul 11:10 a. m. — turno 11am + tolerancia 5min = 11:05.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T17:10:00.000Z')) // 11:10 CR (UTC-6)

    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
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
      sgrh_sucursales: { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null },
      sgrh_programacion_semanal: {
        data: [
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2026-07-31',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [
        {
          employeeId: 10,
          employmentHistoryId: 1,
          fullName: 'Ana Perez',
          days: [
            {
              date: '2026-07-31',
              isJustifiedAbsence: false,
              isDayOff: false,
              isHoliday: false,
              expectedStart: '11:00',
              entradaTime: null,
              toleranciaMinutos: 5,
            },
          ],
        },
      ],
    })
  })

  it('marca como justificados los dias cubiertos por una ausencia aprobada, recortada al mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
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
      sgrh_sucursales: { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null },
      sgrh_programacion_semanal: {
        data: ['2026-07-01', '2026-07-02', '2026-07-03'].map((prg_fecha) => ({
          prg_historial_laboral_id: 1,
          prg_fecha,
          prg_es_dia_libre: false,
          prg_es_feriado: false,
          prg_hora_entrada_custom: null,
          sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
        })),
        error: null,
      },
      sgrh_marcas_asistencia: { data: [], error: null },
      // Incapacidad que arranca el mes anterior: cubre el 1 y el 2 de julio,
      // no el 3. El recorte al rango es lo que se esta probando.
      sgrh_ausencias: {
        data: [
          {
            aus_historial_laboral_id: 1,
            aus_fecha_inicio: '2026-06-28',
            aus_fecha_fin: '2026-07-02',
          },
        ],
        error: null,
      },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result.ok).toBe(true)
    const days = result.ok ? result.data[0].days : []
    expect(days.map((d) => [d.date, d.isJustifiedAbsence])).toEqual([
      ['2026-07-01', true],
      ['2026-07-02', true],
      ['2026-07-03', false],
    ])
  })

  it('devuelve error si falla la consulta de ausencias, en vez de contarlas como inasistencia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
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
      sgrh_sucursales: { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null },
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: null, error: { message: 'boom' } },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo calcular tardias/ausencias del mes.',
    })
  })

  it('usa "Sin nombre" si el empleado no viene en el join', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100, sgrh_empleados: null }],
        error: null,
      },
      sgrh_sucursales: { data: [], error: null },
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Sin nombre', days: [] }],
    })
  })

  it('devuelve error generico si falla alguna de las consultas del mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100, sgrh_empleados: null }],
        error: null,
      },
      sgrh_sucursales: { data: null, error: { message: 'boom' } },
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })

    const result = await gatherMonthlyAttendanceDays(
      client as unknown as Awaited<ReturnType<typeof createClient>>,
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' })
  })
})
