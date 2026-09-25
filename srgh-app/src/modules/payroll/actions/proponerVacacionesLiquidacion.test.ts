import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proponerVacacionesLiquidacion } from './proponerVacacionesLiquidacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const HISTORIAL = {
  lab_id: 1,
  lab_fecha_inicio: '2025-01-01',
  lab_fecha_fin: null,
  lab_salario_base: 300000,
  lab_salario_real: 300000,
  sgrh_empleados: { emp_fecha_ingreso_original: '2025-01-01' },
}

function tipo(codigo: string, ccss: boolean, vacaciones: boolean) {
  return {
    tau_codigo: codigo,
    tau_requiere_documento_ccss: ccss,
    tau_descuenta_vacaciones: vacaciones,
  }
}

function mockSupabase(ausencias: unknown[]) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_ausencias: { data: ausencias, error: null },
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('proponerVacacionesLiquidacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE', 'AUSENCIAS_READ'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('1 por mes laborado, menos vacaciones tomadas y meses de incapacidad', async () => {
    mockSupabase([
      // Lunes 3 al sábado 8 de marzo de 2025: 6 días hábiles.
      {
        aus_historial_laboral_id: 1,
        aus_fecha_inicio: '2025-03-03',
        aus_fecha_fin: '2025-03-08',
        sgrh_cat_tipos_ausencia: tipo('VAC', false, true),
      },
      // 31 días de incapacidad por enfermedad: un mes que no gana.
      {
        aus_historial_laboral_id: 1,
        aus_fecha_inicio: '2025-06-01',
        aus_fecha_fin: '2025-07-01',
        sgrh_cat_tipos_ausencia: tipo('INC_ENF', true, false),
      },
      // La maternidad NO resta.
      {
        aus_historial_laboral_id: 1,
        aus_fecha_inicio: '2025-08-01',
        aus_fecha_fin: '2025-09-30',
        sgrh_cat_tipos_ausencia: tipo('INC_MAT', true, false),
      },
    ])

    const result = await proponerVacacionesLiquidacion(1, '2025-12-31')

    expect(result).toEqual({
      ok: true,
      data: {
        mesesEfectivos: 11,
        diasIncapacidad: 31,
        diasGanados: 11,
        diasTomados: 6,
        diasPendientes: 5,
        inicioRelacion: '2025-01-01',
      },
    })
  })

  it('sin permiso de ausencias no propone (daría 0 tomados sin avisar)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { permisos: ['NOMINA_WRITE'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await proponerVacacionesLiquidacion(1, '2025-12-31')

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza datos inválidos', async () => {
    expect((await proponerVacacionesLiquidacion(0, '2025-12-31')).ok).toBe(false)
    expect((await proponerVacacionesLiquidacion(1, '31/12/2025')).ok).toBe(false)
  })
})
