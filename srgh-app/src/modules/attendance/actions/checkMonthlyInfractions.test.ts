import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkMonthlyInfractions } from './checkMonthlyInfractions'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

describe('checkMonthlyInfractions (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 999 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('no hace nada si no hay colaboradores activos', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_sucursales')
  })

  it('inserta una advertencia cuando un empleado supera el limite de tardias', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100 }],
        error: null,
      },
      sgrh_sucursales: {
        data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 2 }],
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
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2026-07-02',
            prg_es_dia_libre: false,
            prg_es_feriado: false,
            prg_hora_entrada_custom: null,
            sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
          },
          {
            prg_historial_laboral_id: 1,
            prg_fecha: '2026-07-03',
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
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-01 08:05:00',
          },
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-02 08:05:00',
          },
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-03 08:05:00',
          },
        ],
        error: null,
      },
      sgrh_notificaciones: [
        { data: [], error: null },
        { data: null, error: null },
      ],
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: true })

    const notifBuilders = client.from.mock.results
      .filter((_r, i) => client.from.mock.calls[i][0] === 'sgrh_notificaciones')
      .map((r) => r.value)

    expect(notifBuilders).toHaveLength(2)
    expect(notifBuilders[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ntf_empleado_id: 10,
        ntf_tipo_notificacion: 'advertencia',
      })
    )
  })

  it('no inserta una segunda advertencia si ya se aviso este mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100 }],
        error: null,
      },
      sgrh_sucursales: {
        data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 2 }],
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
      sgrh_ausencias: { data: [], error: null },
      sgrh_marcas_asistencia: {
        data: [],
        error: null,
      },
      sgrh_notificaciones: { data: [{ ntf_id: 5 }], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: true })

    const notifBuilders = client.from.mock.results
      .filter((_r, i) => client.from.mock.calls[i][0] === 'sgrh_notificaciones')
      .map((r) => r.value)

    expect(notifBuilders).toHaveLength(1)
    expect(notifBuilders[0].insert).not.toHaveBeenCalled()
  })

  it('no advierte a un empleado dentro de la tolerancia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100 }],
        error: null,
      },
      sgrh_sucursales: {
        data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 10 }],
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
      sgrh_ausencias: { data: [], error: null },
      sgrh_marcas_asistencia: {
        data: [
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-01 08:05:00',
          },
        ],
        error: null,
      },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_notificaciones')
  })

  it('empareja la marca del dia aunque venga con "T" como separador (formato real de Supabase)', async () => {
    // Bug real: si la fecha no se extrae bien de un timestamp con 'T', la
    // marca nunca calza con prg_fecha y el empleado se ve como "ausente"
    // ese dia aunque si marco a tiempo, disparando una advertencia falsa.
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100 }],
        error: null,
      },
      sgrh_sucursales: {
        data: [{ suc_id: 100, suc_tolerancia_tardia_minutos: 10 }],
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
      sgrh_ausencias: { data: [], error: null },
      sgrh_marcas_asistencia: {
        data: [
          {
            mar_historial_laboral_id: 1,
            mar_tipo: 'entrada',
            mar_fecha_hora: '2026-07-01T08:05:00',
          },
        ],
        error: null,
      },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: true })
    // Si la marca no hubiera calzado con el dia programado, se veria como
    // ausencia y esto SI dispararia sgrh_notificaciones.
    expect(client.from).not.toHaveBeenCalledWith('sgrh_notificaciones')
  })

  it('devuelve error generico si falla alguna de las consultas del mes', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: {
        data: [{ lab_id: 1, lab_empleado_id: 10, lab_sucursal_id: 100 }],
        error: null,
      },
      sgrh_sucursales: { data: null, error: { message: 'boom' } },
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [], error: null },
      sgrh_ausencias: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await checkMonthlyInfractions()

    expect(result).toEqual({ ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' })
  })
})
