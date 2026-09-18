import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatherMonthlyAttendanceDays } from './monthlySummary'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { createClient } from '@/lib/supabase/server'

type ClientMock = ReturnType<typeof createSupabaseClientMock>
type QueryResult = { data: unknown; error: unknown }

/** El cliente real que recibe gatherMonthlyAttendanceDays, sin el `as unknown` repetido. */
function asClient(client: ClientMock) {
  return client as unknown as Awaited<ReturnType<typeof createClient>>
}

const ANA = {
  lab_id: 1,
  lab_empleado_id: 10,
  lab_sucursal_id: 100,
  sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
}

/** Fila de programacion con los valores por defecto del caso feliz. */
function assignment(overrides: Record<string, unknown> = {}) {
  return {
    prg_historial_laboral_id: 1,
    prg_sucursal_id: 100,
    prg_fecha: '2026-07-01',
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
    ...overrides,
  }
}

/**
 * Se consultan DOS veces estas dos tablas, en este orden:
 *
 *   programacion → (1) los dias trabajados en las sucursales del usuario,
 *                  (2) donde tiene programacion la plantilla en el rango,
 *                      para no listar aca a quien solo trabajo en otra tienda
 *   historial    → (1) la plantilla de la sucursal (solo lab_id),
 *                  (2) el detalle de todos los que van a salir en el reporte
 *
 * El mock consume un elemento del arreglo por llamada.
 */
function mocks(options: {
  turnos?: QueryResult
  enOtras?: QueryResult
  plantilla?: QueryResult
  detalle?: QueryResult
  sucursales?: QueryResult
  marcas?: QueryResult
  ausencias?: QueryResult
  sucursalId?: number | null
}) {
  const vacio = { data: [], error: null }
  return {
    sgrh_usuarios_empresa_rol: {
      data: [{ uer_sucursal_id: options.sucursalId === undefined ? null : options.sucursalId }],
      error: null,
    },
    sgrh_programacion_semanal: [options.turnos ?? vacio, options.enOtras ?? vacio],
    sgrh_historial_laboral: [options.plantilla ?? vacio, options.detalle ?? vacio],
    sgrh_sucursales: options.sucursales ?? vacio,
    sgrh_marcas_asistencia: options.marcas ?? vacio,
    sgrh_ausencias: options.ausencias ?? vacio,
  }
}

const TOLERANCIA_100 = { data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 5 }], error: null }

/** Mocks del caso feliz: Ana con un dia programado en su sucursal. */
function anaConUnDia(extra: Parameters<typeof mocks>[0] = {}) {
  return mocks({
    turnos: { data: [assignment()], error: null },
    plantilla: { data: [{ lab_id: 1 }], error: null },
    enOtras: { data: [{ prg_historial_laboral_id: 1 }], error: null },
    detalle: { data: [ANA], error: null },
    sucursales: TOLERANCIA_100,
    ...extra,
  })
}

describe('gatherMonthlyAttendanceDays', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve vacio y no consulta el resto si no hay plantilla ni programacion', async () => {
    const client = createSupabaseClientMock(mocks({ sucursalId: 100 }))

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: true, data: [] })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_sucursales')
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('no consulta la sucursal fija si no hay usuarioId', async () => {
    const client = createSupabaseClientMock(mocks({}))

    await gatherMonthlyAttendanceDays(asClient(client), 1, undefined, '2026-07-01', '2026-07-31')

    expect(client.from).not.toHaveBeenCalledWith('sgrh_usuarios_empresa_rol')
  })

  it('devuelve error si falla la carga de la programacion', async () => {
    const client = createSupabaseClientMock(
      mocks({ turnos: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' })
  })

  it('devuelve error si falla la carga de la plantilla', async () => {
    const client = createSupabaseClientMock(
      mocks({ plantilla: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('lista a la plantilla sin dias programados, para no confundir "sin tardias" con "no aparece"', async () => {
    const client = createSupabaseClientMock(
      mocks({
        turnos: { data: [], error: null },
        plantilla: { data: [{ lab_id: 1 }], error: null },
        enOtras: { data: [], error: null },
        detalle: { data: [ANA], error: null },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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

  it('no lista a quien ese mes solo estuvo programado en otra sucursal', async () => {
    // Sus tardias se cuentan en el reporte de la tienda donde trabajo; sumarla
    // aca con cero seria contarla dos veces en dos paneles.
    const client = createSupabaseClientMock(
      mocks({
        turnos: { data: [], error: null },
        plantilla: { data: [{ lab_id: 1 }], error: null },
        enOtras: { data: [{ prg_historial_laboral_id: 1 }], error: null },
        detalle: { data: [ANA], error: null },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('junta nombre, tolerancia y hora real de entrada por dia, con la fecha, acotando por la sucursal del usuario', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({
        sucursalId: 100,
        marcas: {
          data: [
            {
              mar_historial_laboral_id: 1,
              mar_tipo: 'entrada',
              mar_fecha_hora: '2026-07-01T08:20:00',
            },
          ],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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

    // El alcance se pone sobre la sucursal DEL DIA, no sobre la del contrato:
    // es lo que hace que un traslado se cuente donde de verdad se trabajo.
    const programacionCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
    )!.value
    expect(programacionCall.in).toHaveBeenCalledWith('prg_sucursal_id', [100])
  })

  it('toma la tolerancia de la sucursal del dia, no la del contrato', async () => {
    // Ana tiene contrato en la 100 pero ese dia la trasladaron a la 200.
    const client = createSupabaseClientMock(
      anaConUnDia({
        turnos: { data: [assignment({ prg_sucursal_id: 200 })], error: null },
        sucursales: {
          data: [
            { suc_id: 100, suc_tolerancia_tardia_minutos: 5 },
            { suc_id: 200, suc_tolerancia_tardia_minutos: 15 },
          ],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result.ok).toBe(true)
    expect(result.ok ? result.data[0].days[0].toleranciaMinutos : null).toBe(15)
  })

  it('ignora dias futuros: un horario ya asignado para manana no cuenta como ausencia', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({
        // Fecha bien en el futuro respecto a "hoy" real — sin marca posible.
        turnos: {
          data: [
            assignment({
              prg_fecha: '2099-01-01',
              sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
            }),
          ],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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

    const client = createSupabaseClientMock(
      anaConUnDia({
        turnos: {
          data: [
            assignment({
              prg_fecha: '2026-07-31',
              sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
            }),
          ],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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

    const client = createSupabaseClientMock(
      anaConUnDia({
        turnos: {
          data: [
            assignment({
              prg_fecha: '2026-07-31',
              sgrh_cat_horarios: { hor_hora_entrada: '11:00:00' },
            }),
          ],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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
    const client = createSupabaseClientMock(
      anaConUnDia({
        turnos: {
          data: ['2026-07-01', '2026-07-02', '2026-07-03'].map((prg_fecha) =>
            assignment({ prg_fecha })
          ),
          error: null,
        },
        // Incapacidad que arranca el mes anterior: cubre el 1 y el 2 de julio,
        // no el 3. El recorte al rango es lo que se esta probando.
        ausencias: {
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
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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
    const client = createSupabaseClientMock(
      anaConUnDia({ ausencias: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
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
    const client = createSupabaseClientMock(
      anaConUnDia({
        // Dia futuro: entra al reporte pero no genera dias que clasificar.
        turnos: { data: [assignment({ prg_fecha: '2099-01-01' })], error: null },
        detalle: {
          data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100, sgrh_empleados: null }],
          error: null,
        },
      })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2099-01-31'
    )

    expect(result).toEqual({
      ok: true,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Sin nombre', days: [] }],
    })
  })

  it('no reporta a quien ya no tiene contrato activo aunque el dia siguiera programado', async () => {
    // El filtro lab_fecha_fin is null lo deja fuera: la programacion queda
    // como historico y sobrevive a la salida del colaborador.
    const client = createSupabaseClientMock(anaConUnDia({ detalle: { data: [], error: null } }))

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: true, data: [] })
  })

  it('devuelve error generico si falla alguna de las consultas del mes', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({ sucursales: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31'
    )

    expect(result).toEqual({ ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' })
  })
})
