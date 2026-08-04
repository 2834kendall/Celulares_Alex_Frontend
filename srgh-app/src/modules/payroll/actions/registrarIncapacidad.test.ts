import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registrarIncapacidad } from './registrarIncapacidad'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const OK = { data: null, error: null }

const INPUT = { historialLaboralId: 7, fechaInicio: '2026-07-14', fechaFin: '2026-07-15' }

const HISTORIAL = { data: { lab_id: 7, lab_fecha_fin: null }, error: null }
const TIPO_AUSENCIA = {
  data: { tau_id: 3, tau_paga_empleador_dias: 3, tau_porcentaje_pago_empleador: 50 },
  error: null,
}

const PERIODO_1 = {
  npe_id: 101,
  npe_periodo_mes: 7,
  npe_periodo_anio: 2026,
  npe_quincena: 1,
  npe_fecha_inicio_periodo: '2026-07-01',
  npe_fecha_fin_periodo: '2026-07-15',
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('registrarIncapacidad (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos inválidos sin llamar a Supabase', async () => {
    const result = await registrarIncapacidad({
      historialLaboralId: 0,
      fechaInicio: '2026-07-15',
      fechaFin: '2026-07-14',
      numeroBoletaCcss: null,
    })

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el empleado no existe', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: null, error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({ ok: false, error: 'El empleado no existe o no es visible.' })
  })

  it('rechaza si el empleado ya tiene una salida registrada', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: { lab_id: 7, lab_fecha_fin: '2026-06-01' }, error: null },
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({ ok: false, error: 'Este empleado ya tiene una salida registrada.' })
  })

  it('rechaza si no existe el tipo de ausencia INC_ENF en el catálogo', async () => {
    mockSupabase({
      sgrh_historial_laboral: HISTORIAL,
      sgrh_cat_tipos_ausencia: { data: null, error: null },
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({
      ok: false,
      error:
        'No se encontró el tipo de ausencia "Incapacidad por Enfermedad" (INC_ENF) en el catálogo.',
    })
  })

  it('rechaza si falla el insert en sgrh_ausencias', async () => {
    mockSupabase({
      sgrh_historial_laboral: HISTORIAL,
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
      sgrh_ausencias: { data: null, error: { message: 'boom' } },
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la incapacidad.' })
  })

  it('avisa si la incapacidad se guardó pero no se pudieron leer los periodos', async () => {
    mockSupabase({
      sgrh_historial_laboral: HISTORIAL,
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
      sgrh_ausencias: OK,
      sgrh_nomina_detalle: { data: null, error: { message: 'boom' } },
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({
      ok: false,
      error:
        'La incapacidad se guardó. No se pudieron actualizar los periodos de nómina. Revisalo manualmente.',
    })
  })

  it('registra la incapacidad y reparte los días en el periodo afectado', async () => {
    const client = mockSupabase({
      sgrh_historial_laboral: HISTORIAL,
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
      sgrh_ausencias: OK,
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 1,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_1,
            },
          ],
          error: null,
        },
        OK,
      ],
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: 'B-123' })

    expect(result).toEqual({
      ok: true,
      periodosActualizados: [
        { periodoId: 101, periodoLabel: expect.any(String), diasEmpleador: 2, diasCcss: 0 },
      ],
      diasSinPeriodo: 0,
    })
    expect(client.from).toHaveBeenCalledWith('sgrh_ausencias')
  })

  it('avisa si falla al actualizar algún periodo de nómina', async () => {
    mockSupabase({
      sgrh_historial_laboral: HISTORIAL,
      sgrh_cat_tipos_ausencia: TIPO_AUSENCIA,
      sgrh_ausencias: OK,
      sgrh_nomina_detalle: [
        {
          data: [
            {
              ndt_id: 1,
              ndt_dias_incapacidad_empleador: 0,
              ndt_dias_incapacidad_ccss: 0,
              sgrh_nomina_periodo: PERIODO_1,
            },
          ],
          error: null,
        },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await registrarIncapacidad({ ...INPUT, numeroBoletaCcss: null })

    expect(result).toEqual({
      ok: false,
      error:
        'La incapacidad se guardó. No se pudieron actualizar todos los periodos de nómina. Revisalo manualmente.',
    })
  })
})
