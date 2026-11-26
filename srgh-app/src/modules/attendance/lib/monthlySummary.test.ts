import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatherMonthlyAttendanceDays } from './monthlySummary'
import { DEFAULT_TARDINESS_TYPES } from './infractions'
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
  tipos?: QueryResult
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
    // Catalogo vacio: el lector cae a los tipos por defecto (leve desde 1,
    // tardia desde 6, grave desde 11).
    sgrh_cat_tipos_tardia: options.tipos ?? vacio,
    sgrh_marcas_asistencia: options.marcas ?? vacio,
    sgrh_justificaciones_bloque: vacio,
    sgrh_ausencias: options.ausencias ?? vacio,
  }
}

/** Mocks del caso feliz: Ana con un dia programado en su sucursal. */
function anaConUnDia(extra: Parameters<typeof mocks>[0] = {}) {
  return mocks({
    turnos: { data: [assignment()], error: null },
    plantilla: { data: [{ lab_id: 1 }], error: null },
    enOtras: { data: [{ prg_historial_laboral_id: 1 }], error: null },
    detalle: { data: [ANA], error: null },
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({ ok: true, data: [], tipos: DEFAULT_TARDINESS_TYPES })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('no consulta la sucursal fija si no hay usuarioId', async () => {
    const client = createSupabaseClientMock(mocks({}))

    await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      undefined,
      '2026-07-01',
      '2026-07-31',
      null
    )

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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron calcular las tardías y las ausencias del mes.',
    })
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
      '2026-07-31',
      null
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({ ok: true, data: [], tipos: DEFAULT_TARDINESS_TYPES })
  })

  it('junta nombre y hora real de entrada por dia, con la fecha, acotando por la sucursal del usuario', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({
        sucursalId: 100,
        marcas: {
          data: [
            {
              mar_id: 77,
              mar_historial_laboral_id: 1,
              mar_tipo: 'entrada',
              mar_fecha_hora: '2026-07-01T08:20:00',
              mar_tardia_justificada: false,
              mar_tardia_justificacion: null,
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
      data: [
        {
          employeeId: 10,
          employmentHistoryId: 1,
          fullName: 'Ana Perez',
          days: [
            {
              date: '2026-07-01',
              isJustifiedAbsence: false,
              ausenciaTipo: null,
              isDayOff: false,
              isHoliday: false,
              expectedStart: '08:00',
              entradaTime: '08:20',
              entradaMarkId: 77,
              isJustifiedTardiness: false,
              tardiaJustificacion: null,
              inicioAlmuerzoTime: null,
              finAlmuerzoTime: null,
              finAlmuerzoMarkId: null,
              isJustifiedLunchTardiness: false,
              lunchJustificacion: null,
              secondBlockExpectedStart: null,
              entradaCount: 1,
              secondBlockDue: true,
              secondBlockEntradaTime: null,
              secondBlockMarkId: null,
              isJustifiedSecondBlockTardiness: false,
              isJustifiedSecondBlockAbsence: false,
              isSingleDayPaidAbsence: false,
              secondBlockAbsenceType: null,
              secondBlockJustificacion: null,
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

  it('un dia de dos tramos (SGRH-110) es un solo dia, medido contra el que empieza primero', async () => {
    // La tarde (13:00) viene antes en la consulta: el orden no debe importar.
    const tarde = assignment({ prg_sucursal_id: 200, prg_hora_entrada_custom: '13:00:00' })
    const manana = assignment({ prg_hora_entrada_custom: '08:00:00' })
    const client = createSupabaseClientMock(
      anaConUnDia({ turnos: { data: [tarde, manana], error: null } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31',
      null
    )

    expect(result.ok && result.data[0].days).toEqual([
      expect.objectContaining({ date: '2026-07-01', expectedStart: '08:00', entradaTime: null }),
    ])
  })

  describe('segundo bloque (SGRH-110)', () => {
    const marca = (
      id: number,
      tipo: string,
      hora: string,
      extra: Record<string, unknown> = {}
    ) => ({
      mar_id: id,
      mar_historial_laboral_id: 1,
      mar_tipo: tipo,
      mar_fecha_hora: `2026-07-01T${hora}`,
      mar_tardia_justificada: false,
      mar_tardia_justificacion: null,
      ...extra,
    })

    async function diaDe(client: ClientMock) {
      const result = await gatherMonthlyAttendanceDays(
        asClient(client),
        1,
        5,
        '2026-07-01',
        '2026-07-31',
        null
      )
      if (!result.ok) throw new Error(result.error)
      return result.data[0].days[0]
    }

    const plantillaPartida = {
      hor_hora_entrada: '07:00:00',
      hor_hora_entrada_2: '16:00:00',
      hor_hora_salida_2: '20:00:00',
    }

    it('una plantilla partida mide la segunda entrada contra el inicio de su segundo bloque', async () => {
      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: {
            data: [
              marca(1, 'entrada', '07:00:00'),
              marca(2, 'salida', '11:00:00'),
              marca(3, 'entrada', '16:12:00', {
                mar_tardia_justificada: true,
                mar_tardia_justificacion: 'Fallo del sistema',
              }),
              marca(4, 'salida', '20:00:00'),
            ],
            error: null,
          },
        })
      )

      expect(await diaDe(client)).toMatchObject({
        expectedStart: '07:00',
        entradaTime: '07:00',
        secondBlockExpectedStart: '16:00',
        secondBlockEntradaTime: '16:12',
        secondBlockMarkId: 3,
        isJustifiedSecondBlockTardiness: true,
        secondBlockJustificacion: 'Fallo del sistema',
      })
    })

    it('dos tramos en sucursales distintas: el segundo bloque es el del tramo que empieza despues', async () => {
      const manana = assignment({
        prg_hora_entrada_custom: '08:00:00',
        prg_hora_salida_custom: '12:00:00',
      })
      const tarde = assignment({
        prg_sucursal_id: 200,
        prg_hora_entrada_custom: '13:00:00',
        prg_hora_salida_custom: '17:00:00',
      })
      const client = createSupabaseClientMock(
        anaConUnDia({
          // La tarde antes que la manana: el orden de la consulta no importa.
          turnos: { data: [tarde, manana], error: null },
          marcas: {
            data: [
              marca(1, 'entrada', '08:00:00'),
              marca(2, 'salida', '12:00:00'),
              marca(3, 'entrada', '13:20:00'),
              marca(4, 'salida', '17:00:00'),
            ],
            error: null,
          },
        })
      )

      expect(await diaDe(client)).toMatchObject({
        expectedStart: '08:00',
        secondBlockExpectedStart: '13:00',
        secondBlockEntradaTime: '13:20',
        secondBlockMarkId: 3,
      })
    })

    it('un dia de un solo bloque no trae segundo bloque, aunque marque dos veces', async () => {
      const client = createSupabaseClientMock(
        anaConUnDia({
          marcas: {
            data: [
              marca(1, 'entrada', '08:00:00'),
              marca(2, 'salida', '12:00:00'),
              marca(3, 'entrada', '13:00:00'),
              marca(4, 'salida', '17:00:00'),
            ],
            error: null,
          },
        })
      )

      expect(await diaDe(client)).toMatchObject({
        secondBlockExpectedStart: null,
        secondBlockEntradaTime: '13:00',
      })
    })

    it('si el segundo bloque no se marco, no hay entrada que medir', async () => {
      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: {
            data: [marca(1, 'entrada', '07:00:00'), marca(2, 'salida', '11:00:00')],
            error: null,
          },
        })
      )

      expect(await diaDe(client)).toMatchObject({
        secondBlockExpectedStart: '16:00',
        secondBlockEntradaTime: null,
        secondBlockMarkId: null,
      })
    })

    it('cuenta las entradas del dia, aunque no se puedan emparejar en bloques', async () => {
      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: {
            data: [
              // Dos entradas seguidas, sin salida en medio: no alternan.
              marca(1, 'entrada', '07:00:00'),
              marca(2, 'entrada', '16:00:00'),
            ],
            error: null,
          },
        })
      )

      expect(await diaDe(client)).toMatchObject({ entradaCount: 2, secondBlockEntradaTime: null })
    })

    it('un dia pasado con el segundo bloque programado ya esta vencido', async () => {
      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: { data: [marca(1, 'entrada', '07:00:00')], error: null },
        })
      )

      expect(await diaDe(client)).toMatchObject({ entradaCount: 1, secondBlockDue: true })
    })

    it('hoy el segundo bloque no vence hasta que pasa su primera tardia', async () => {
      vi.useFakeTimers()
      // 14:00 en Costa Rica (UTC-6): el segundo bloque (16:00) no ha empezado.
      vi.setSystemTime(new Date('2026-07-01T20:00:00Z'))

      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: { data: [marca(1, 'entrada', '07:00:00')], error: null },
        })
      )

      expect(await diaDe(client)).toMatchObject({ secondBlockDue: false })
    })

    it('hoy, ya pasado el minuto de la primera tardia del segundo bloque, vence', async () => {
      vi.useFakeTimers()
      // 16:05 en Costa Rica: ya habria sido tardia.
      vi.setSystemTime(new Date('2026-07-01T22:05:00Z'))

      const client = createSupabaseClientMock(
        anaConUnDia({
          turnos: {
            data: [assignment({ sgrh_cat_horarios: plantillaPartida })],
            error: null,
          },
          marcas: { data: [marca(1, 'entrada', '07:00:00')], error: null },
        })
      )

      expect(await diaDe(client)).toMatchObject({ secondBlockDue: true })
    })

    // SGRH-120: un bloque en cada tienda. La entrada de la manana en otra
    // sucursal no puede contar como la del bloque de esta, o el encargado de
    // la tienda de la tarde nunca ve que la persona no llego.
    it('con alcance de sucursal, solo cuenta las marcas hechas en esas sucursales', async () => {
      const client = createSupabaseClientMock(anaConUnDia({ sucursalId: 100 }))
      await diaDe(client)

      const marcasCall = client.from.mock.results.find(
        (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
      )!.value
      expect(marcasCall.in).toHaveBeenCalledWith('mar_sucursal_id', [100])
    })

    it('sin alcance (todas las sucursales) cuenta todas las marcas', async () => {
      const client = createSupabaseClientMock(anaConUnDia())
      await diaDe(client)

      const marcasCall = client.from.mock.results.find(
        (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
      )!.value
      expect(marcasCall.in).not.toHaveBeenCalledWith('mar_sucursal_id', expect.anything())
    })

    it('trae tambien las salidas para armar los bloques', async () => {
      const client = createSupabaseClientMock(anaConUnDia())
      await diaDe(client)

      const marcasCall = client.from.mock.results.find(
        (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
      )!.value
      expect(marcasCall.in).toHaveBeenCalledWith('mar_tipo', [
        'entrada',
        'salida',
        'inicio_almuerzo',
        'fin_almuerzo',
      ])
    })
  })

  it('devuelve el catalogo de la empresa para que el llamador clasifique con las mismas reglas', async () => {
    const catalogo = [
      {
        tta_id: 7,
        tta_nombre: 'Tarde',
        tta_desde_minutos: 3,
        tta_cuenta_advertencia: true,
        tta_color: '#123456',
      },
    ]
    const client = createSupabaseClientMock(anaConUnDia({ tipos: { data: catalogo, error: null } }))

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31',
      null
    )

    expect(result.ok && result.tipos).toEqual([
      { id: 7, nombre: 'Tarde', desdeMinutos: 3, cuentaAdvertencia: true, color: '#123456' },
    ])

    const catalogoCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_cat_tipos_tardia'
    )!.value
    expect(catalogoCall.eq).toHaveBeenCalledWith('tta_empresa_id', 1)
  })

  it('devuelve error si falla la carga del catalogo, en vez de clasificar con reglas ajenas', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({ tipos: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31',
      null
    )

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los tipos de tardía.' })
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
      '2099-01-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Ana Perez', days: [] }],
    })
  })

  it('el turno de HOY que todavia no llega al primer tipo de tardia no cuenta como ausencia', async () => {
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
      data: [{ employeeId: 10, employmentHistoryId: 1, fullName: 'Ana Perez', days: [] }],
    })
  })

  it('el turno de HOY ya vencido (paso el primer tipo de tardia) sin marca si cuenta como ausencia', async () => {
    // "Ahora" en Costa Rica: 31-jul 11:10 a. m. — turno 11am, tardanza desde el minuto 1.
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
      data: [
        {
          employeeId: 10,
          employmentHistoryId: 1,
          fullName: 'Ana Perez',
          days: [
            {
              date: '2026-07-31',
              isJustifiedAbsence: false,
              ausenciaTipo: null,
              isDayOff: false,
              isHoliday: false,
              expectedStart: '11:00',
              entradaTime: null,
              entradaMarkId: null,
              isJustifiedTardiness: false,
              tardiaJustificacion: null,
              inicioAlmuerzoTime: null,
              finAlmuerzoTime: null,
              finAlmuerzoMarkId: null,
              isJustifiedLunchTardiness: false,
              lunchJustificacion: null,
              secondBlockExpectedStart: null,
              entradaCount: 0,
              secondBlockDue: true,
              secondBlockEntradaTime: null,
              secondBlockMarkId: null,
              isJustifiedSecondBlockTardiness: false,
              isJustifiedSecondBlockAbsence: false,
              isSingleDayPaidAbsence: false,
              secondBlockAbsenceType: null,
              secondBlockJustificacion: null,
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
              sgrh_cat_tipos_ausencia: { tau_nombre: 'Incapacidad por Enfermedad' },
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
      '2026-07-31',
      null
    )

    expect(result.ok).toBe(true)
    const days = result.ok ? result.data[0].days : []
    expect(days.map((d) => [d.date, d.isJustifiedAbsence, d.ausenciaTipo])).toEqual([
      ['2026-07-01', true, 'Incapacidad por Enfermedad'],
      ['2026-07-02', true, 'Incapacidad por Enfermedad'],
      ['2026-07-03', false, null],
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron calcular las tardías y las ausencias del mes.',
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
      '2099-01-31',
      null
    )

    expect(result).toEqual({
      ok: true,
      tipos: DEFAULT_TARDINESS_TYPES,
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
      '2026-07-31',
      null
    )

    expect(result).toEqual({ ok: true, data: [], tipos: DEFAULT_TARDINESS_TYPES })
  })

  it('devuelve error generico si falla alguna de las consultas del mes', async () => {
    const client = createSupabaseClientMock(
      anaConUnDia({ marcas: { data: null, error: { message: 'boom' } } })
    )

    const result = await gatherMonthlyAttendanceDays(
      asClient(client),
      1,
      5,
      '2026-07-01',
      '2026-07-31',
      null
    )

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron calcular las tardías y las ausencias del mes.',
    })
  })
})
