import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDailyAttendance } from './getDailyAttendance'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const DATE = '2026-07-25'

type ClientMock = ReturnType<typeof createSupabaseClientMock>
type QueryResult = { data: unknown; error: unknown }

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

const ANA_HISTORIAL = {
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
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    prg_historial_laboral_id: 1,
    prg_empleado_id: 10,
    prg_sucursal_id: 100,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
    ...overrides,
  }
}

/**
 * La action consulta cada una de estas dos tablas DOS veces, en este orden:
 *
 *   programacion → (1) los turnos de la sucursal, (2) donde esta programada
 *                  la plantilla ese dia, para descontar a los trasladados
 *   historial    → (1) la plantilla de la sucursal (solo lab_id),
 *                  (2) el detalle de todos los que van a salir en el panel
 *
 * El mock consume un elemento del arreglo por llamada, asi que hay que darle
 * las dos respuestas en orden.
 */
function mocks(options: {
  turnos?: QueryResult
  trasladados?: QueryResult
  plantilla?: QueryResult
  detalle?: QueryResult
  marcas?: QueryResult
  tipos?: QueryResult
  sucursalId?: number | null
}) {
  const vacio = { data: [], error: null }
  return {
    sgrh_usuarios_empresa_rol: {
      data: [{ uer_sucursal_id: options.sucursalId === undefined ? 100 : options.sucursalId }],
      error: null,
    },
    sgrh_programacion_semanal: [options.turnos ?? vacio, options.trasladados ?? vacio],
    sgrh_marcas_asistencia: options.marcas ?? vacio,
    sgrh_historial_laboral: [options.plantilla ?? vacio, options.detalle ?? vacio],
    // Catalogo vacio: el lector usa los tipos por defecto (desde el minuto 1).
    sgrh_cat_tipos_tardia: options.tipos ?? vacio,
  }
}

/** Primera llamada registrada sobre esa tabla. */
function callOn(client: ClientMock, table: string) {
  return client.from.mock.results.find((_r, i) => client.from.mock.calls[i][0] === table)!.value
}

describe('getDailyAttendance (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 99 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('devuelve error si falla la carga de la programacion del dia', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar la programacion del dia.' })
  })

  it('devuelve error si falla la carga de la plantilla', async () => {
    useClient(
      createSupabaseClientMock(mocks({ plantilla: { data: null, error: { message: 'boom' } } }))
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('devuelve vacio cuando la sucursal no tiene ni plantilla ni turnos ni marcas', async () => {
    useClient(createSupabaseClientMock(mocks({})))

    expect(await getDailyAttendance(DATE)).toEqual({ ok: true, date: DATE, data: [] })
  })

  it('lista a la plantilla de la sucursal aunque nadie tenga turno ese dia', async () => {
    // El panel es donde el encargado corrige marcas: si escondiera a quien no
    // quedo programado, un olvido de planificacion le dejaria el dia en blanco
    // y sin forma de arreglarlo.
    useClient(
      createSupabaseClientMock(
        mocks({
          turnos: { data: [], error: null },
          plantilla: { data: [{ lab_id: 1 }], error: null },
          detalle: { data: [ANA_HISTORIAL], error: null },
        })
      )
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].fullName).toBe('Ana Perez')
    expect(result.data[0].expectedStart).toBeNull()
    expect(result.data[0].entrada).toBeNull()
  })

  it('descuenta de la plantilla a quien ese dia fue trasladado a otra sucursal', async () => {
    // Ya aparece en el panel de la tienda donde de verdad trabajo; sin esto
    // saldria en los dos a la vez.
    useClient(
      createSupabaseClientMock(
        mocks({
          turnos: { data: [], error: null },
          plantilla: { data: [{ lab_id: 1 }], error: null },
          trasladados: {
            data: [{ prg_historial_laboral_id: 1, prg_sucursal_id: 200 }],
            error: null,
          },
          detalle: { data: [ANA_HISTORIAL], error: null },
        })
      )
    )

    expect(await getDailyAttendance(DATE)).toEqual({ ok: true, date: DATE, data: [] })
  })

  it('cruza marcas y programacion, calculando la diferencia solo en la entrada', async () => {
    useClient(
      createSupabaseClientMock(
        mocks({
          turnos: { data: [assignment()], error: null },
          plantilla: { data: [{ lab_id: 1 }], error: null },
          detalle: { data: [ANA_HISTORIAL], error: null },
          marcas: {
            data: [
              {
                mar_id: 1,
                mar_historial_laboral_id: 1,
                mar_sucursal_id: 100,
                mar_tipo: 'entrada',
                mar_fecha_hora: `${DATE} 08:04:00`,
              },
              {
                mar_id: 2,
                mar_historial_laboral_id: 1,
                mar_sucursal_id: 100,
                mar_tipo: 'salida',
                mar_fecha_hora: `${DATE} 17:00:00`,
              },
            ],
            error: null,
          },
        })
      )
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(1)
    const row = result.data[0]
    expect(row.fullName).toBe('Ana Perez')
    expect(row.expectedStart).toBe('08:00')
    expect(row.entrada).toEqual({ id: 1, time: '08:04', diffMinutes: 4 })
    expect(row.salida).toEqual({ id: 2, time: '17:00', diffMinutes: null })
    expect(row.inicioAlmuerzo).toBeNull()
    expect(row.isOpen).toBe(false)
    expect(row.duplicateMarksCount).toBe(0)
  })

  it('reporta la sucursal DEL DIA, no la del contrato', async () => {
    // Ana tiene contrato en la 100 y ese dia la trasladaron a la 200, que es
    // una de las que ve este gerente. De ahi sale el sucursalId con el que el
    // modal de correccion guarda una marca manual.
    useClient(
      createSupabaseClientMock({
        ...mocks({
          turnos: { data: [assignment({ prg_sucursal_id: 200 })], error: null },
          plantilla: { data: [], error: null },
          detalle: { data: [ANA_HISTORIAL], error: null },
        }),
        sgrh_usuarios_empresa_rol: {
          data: [{ uer_sucursal_id: 100 }, { uer_sucursal_id: 200 }],
          error: null,
        },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0].branchId).toBe(200)
  })

  it('no pierde una marca cuya programacion ya no existe: la fila sale con la sucursal de la marca', async () => {
    useClient(
      createSupabaseClientMock(
        mocks({
          turnos: { data: [], error: null },
          plantilla: { data: [], error: null },
          detalle: { data: [ANA_HISTORIAL], error: null },
          marcas: {
            data: [
              {
                mar_id: 1,
                mar_historial_laboral_id: 1,
                mar_sucursal_id: 100,
                mar_tipo: 'entrada',
                mar_fecha_hora: `${DATE} 08:04:00`,
              },
            ],
            error: null,
          },
        })
      )
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].branchId).toBe(100)
    expect(result.data[0].expectedStart).toBeNull()
    expect(result.data[0].entrada).toEqual({ id: 1, time: '08:04', diffMinutes: null })
  })

  it('lee correctamente una marca con "T" como separador (formato real de lectura de Supabase)', async () => {
    // Bug real encontrado probando en el navegador: se inserta con espacio
    // ("YYYY-MM-DD HH:mm:ss") pero Postgres/PostgREST devuelve el timestamp
    // con 'T' al leerlo — la tabla mostraba "2026-" en vez de la hora.
    useClient(
      createSupabaseClientMock(
        mocks({
          plantilla: { data: [{ lab_id: 1 }], error: null },
          detalle: { data: [ANA_HISTORIAL], error: null },
          marcas: {
            data: [
              {
                mar_id: 1,
                mar_historial_laboral_id: 1,
                mar_sucursal_id: 100,
                mar_tipo: 'entrada',
                mar_fecha_hora: `${DATE}T08:04:00`,
              },
            ],
            error: null,
          },
        })
      )
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data[0].entrada).toEqual({ id: 1, time: '08:04', diffMinutes: null })
  })

  it('ignora una marca cuyo tipo no calza con el vocabulario valido', async () => {
    useClient(
      createSupabaseClientMock(
        mocks({
          turnos: { data: [assignment()], error: null },
          plantilla: { data: [{ lab_id: 1 }], error: null },
          detalle: { data: [{ ...ANA_HISTORIAL, sgrh_cat_puestos: null }], error: null },
          marcas: {
            data: [
              {
                mar_id: 1,
                mar_historial_laboral_id: 1,
                mar_sucursal_id: 100,
                mar_tipo: 'Entrad',
                mar_fecha_hora: `${DATE} 08:04:00`,
              },
            ],
            error: null,
          },
        })
      )
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data[0].entrada).toBeNull()
  })

  it('acota programacion, marcas y plantilla por las sucursales del gerente', async () => {
    const client = useClient(createSupabaseClientMock(mocks({})))

    await getDailyAttendance(DATE)

    expect(callOn(client, 'sgrh_programacion_semanal').in).toHaveBeenCalledWith(
      'prg_sucursal_id',
      [100]
    )
    expect(callOn(client, 'sgrh_marcas_asistencia').in).toHaveBeenCalledWith(
      'mar_sucursal_id',
      [100]
    )
    expect(callOn(client, 'sgrh_historial_laboral').in).toHaveBeenCalledWith(
      'lab_sucursal_id',
      [100]
    )
  })

  it('sin sucursal asignada al gerente, no acota por sucursal', async () => {
    const client = useClient(createSupabaseClientMock(mocks({ sucursalId: null })))

    await getDailyAttendance(DATE)

    // Sin sucursal fija (ADMIN/RRHH) se ve toda la empresa: no se aplica
    // ninguno de los tres filtros de sucursal.
    expect(callOn(client, 'sgrh_programacion_semanal').in).not.toHaveBeenCalledWith(
      'prg_sucursal_id',
      expect.anything()
    )
    expect(callOn(client, 'sgrh_marcas_asistencia').in).not.toHaveBeenCalledWith(
      'mar_sucursal_id',
      expect.anything()
    )
    expect(callOn(client, 'sgrh_historial_laboral').in).not.toHaveBeenCalledWith(
      'lab_sucursal_id',
      expect.anything()
    )
  })
})
