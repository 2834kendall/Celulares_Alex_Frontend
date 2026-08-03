import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAusenciasForWeek } from './getAusenciasForWeek'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const WEEK_START = '2026-01-05'
const WEEK_END = '2026-01-11'

describe('getAusenciasForWeek (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {},
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await getAusenciasForWeek(WEEK_START, WEEK_END)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('devuelve error si falla la carga del historial laboral', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciasForWeek(WEEK_START, WEEK_END)

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los colaboradores.' })
  })

  it('no consulta ausencias cuando no hay colaboradores activos', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciasForWeek(WEEK_START, WEEK_END)

    expect(result).toEqual({ ok: true, data: [] })
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('devuelve error si falla la carga de ausencias', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [{ lab_id: 1 }], error: null },
        sgrh_ausencias: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciasForWeek(WEEK_START, WEEK_END)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cargar las incapacidades y periodos de lactancia.',
    })
  })

  it('mapea las ausencias solapadas con la semana en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: [{ lab_id: 1 }], error: null },
        sgrh_ausencias: {
          data: [
            {
              aus_id: 9,
              aus_historial_laboral_id: 1,
              aus_tipo_ausencia_id: 3,
              aus_fecha_inicio: '2026-01-06',
              aus_fecha_fin: '2026-01-08',
              aus_numero_boleta_ccss: 'B-123',
              aus_observaciones: null,
              sgrh_cat_tipos_ausencia: {
                tau_codigo: 'INC_ENF_CCSS',
                tau_nombre: 'Incapacidad por enfermedad (CCSS)',
                tau_es_intradia: false,
              },
            },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getAusenciasForWeek(WEEK_START, WEEK_END)

    expect(result).toEqual({
      ok: true,
      data: [
        {
          ausenciaId: 9,
          employmentHistoryId: 1,
          tipoAusenciaId: 3,
          fechaInicio: '2026-01-06',
          fechaFin: '2026-01-08',
          tipoCodigo: 'INC_ENF_CCSS',
          tipoNombre: 'Incapacidad por enfermedad (CCSS)',
          esIntradia: false,
          numeroBoletaCcss: 'B-123',
          observaciones: null,
        },
      ],
    })
  })
})
