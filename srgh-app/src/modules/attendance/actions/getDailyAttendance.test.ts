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

  it('devuelve error si falla la carga del historial laboral', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('no consulta programacion ni marcas cuando no hay colaboradores activos', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getDailyAttendance(DATE)

    expect(result).toEqual({ ok: true, date: DATE, data: [] })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('cruza marcas y programacion, calculando la diferencia solo en la entrada', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
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
              prg_historial_laboral_id: 1,
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
              mar_id: 1,
              mar_historial_laboral_id: 1,
              mar_tipo: 'entrada',
              mar_fecha_hora: `${DATE} 08:04:00`,
            },
            {
              mar_id: 2,
              mar_historial_laboral_id: 1,
              mar_tipo: 'salida',
              mar_fecha_hora: `${DATE} 17:00:00`,
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
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

  it('ignora una marca cuyo tipo no calza con el vocabulario valido', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
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
              sgrh_cat_puestos: null,
            },
          ],
          error: null,
        },
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: {
          data: [
            {
              mar_id: 1,
              mar_historial_laboral_id: 1,
              mar_tipo: 'Entrad',
              mar_fecha_hora: `${DATE} 08:04:00`,
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getDailyAttendance(DATE)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data[0].entrada).toBeNull()
  })

  it('sin sucursal asignada al gerente, no filtra el historial por sucursal', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    await getDailyAttendance(DATE)

    const historialCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_historial_laboral'
    )
    expect(historialCall).toBeDefined()
    // Sin sucursal fija (ADMIN/RRHH), el filtro .eq('lab_sucursal_id', ...) no se aplica.
    expect(historialCall!.value.eq).not.toHaveBeenCalledWith('lab_sucursal_id', expect.anything())
  })
})
