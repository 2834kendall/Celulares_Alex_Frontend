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

  it('devuelve error si falla la carga del historial laboral', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('no consulta el historial cuando no hay ni programacion ni marcas ese dia', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: true, date: DATE, data: [] })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_historial_laboral')
  })

  it('cruza marcas y programacion, calculando la diferencia solo en la entrada', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: { data: [ANA_HISTORIAL], error: null },
        sgrh_marcas_asistencia: {
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
    // Ana tiene contrato en la 100 y ese dia la trasladaron a la 200. La fila
    // tiene que salir con la 200: de ahi sale el sucursalId con el que el
    // modal de correccion guarda una marca manual.
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
        sgrh_programacion_semanal: { data: [assignment({ prg_sucursal_id: 200 })], error: null },
        sgrh_historial_laboral: { data: [ANA_HISTORIAL], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0].branchId).toBe(200)
  })

  it('no pierde una marca cuya programacion ya no existe: la fila sale con la sucursal de la marca', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_historial_laboral: { data: [ANA_HISTORIAL], error: null },
        sgrh_marcas_asistencia: {
          data: [
            {
              mar_id: 1,
              mar_historial_laboral_id: 1,
              mar_sucursal_id: 200,
              mar_tipo: 'entrada',
              mar_fecha_hora: `${DATE} 08:04:00`,
            },
          ],
          error: null,
        },
      })
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0].branchId).toBe(200)
    expect(result.data[0].expectedStart).toBeNull()
    expect(result.data[0].entrada).toEqual({ id: 1, time: '08:04', diffMinutes: null })
  })

  it('lee correctamente una marca con "T" como separador (formato real de lectura de Supabase)', async () => {
    // Bug real encontrado probando en el navegador: se inserta con espacio
    // ("YYYY-MM-DD HH:mm:ss") pero Postgres/PostgREST devuelve el timestamp
    // con 'T' al leerlo — la tabla mostraba "2026-" en vez de la hora.
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_historial_laboral: { data: [ANA_HISTORIAL], error: null },
        sgrh_marcas_asistencia: {
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

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data[0].entrada).toEqual({ id: 1, time: '08:04', diffMinutes: null })
  })

  it('ignora una marca cuyo tipo no calza con el vocabulario valido', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: {
          data: [{ ...ANA_HISTORIAL, sgrh_cat_puestos: null }],
          error: null,
        },
        sgrh_marcas_asistencia: {
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

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data[0].entrada).toBeNull()
  })

  it('acota programacion y marcas por las sucursales del gerente', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    await getDailyAttendance(DATE)

    const callOn = (table: string) =>
      client.from.mock.results.find((_r, i) => client.from.mock.calls[i][0] === table)!.value

    expect(callOn('sgrh_programacion_semanal').in).toHaveBeenCalledWith('prg_sucursal_id', [100])
    expect(callOn('sgrh_marcas_asistencia').in).toHaveBeenCalledWith('mar_sucursal_id', [100])
  })

  it('sin sucursal asignada al gerente, no acota por sucursal', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: null }], error: null },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    await getDailyAttendance(DATE)

    const callOn = (table: string) =>
      client.from.mock.results.find((_r, i) => client.from.mock.calls[i][0] === table)!.value

    // Sin sucursal fija (ADMIN/RRHH) se ve toda la empresa: ni el filtro de
    // programacion ni el de marcas se aplican.
    expect(callOn('sgrh_programacion_semanal').in).not.toHaveBeenCalledWith(
      'prg_sucursal_id',
      expect.anything()
    )
    expect(callOn('sgrh_marcas_asistencia').in).not.toHaveBeenCalledWith(
      'mar_sucursal_id',
      expect.anything()
    )
  })
})
