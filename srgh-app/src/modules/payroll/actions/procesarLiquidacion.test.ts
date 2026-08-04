import { beforeEach, describe, expect, it, vi } from 'vitest'
import { procesarLiquidacion } from './procesarLiquidacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ProcesarLiquidacionInput } from '@/modules/payroll/types'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const HISTORIAL = {
  lab_id: 1,
  lab_fecha_inicio: '2020-01-15',
  lab_fecha_fin: null,
  lab_salario_real: 300000,
}

// Renuncia sin responsabilidad patronal: no genera cesantía ni preaviso.
const MOTIVO_SIN_DERECHOS = { mot_id: 5, mot_genera_cesantia: false, mot_genera_preaviso: false }
// Despido injustificado: genera ambos.
const MOTIVO_CON_DERECHOS = { mot_id: 6, mot_genera_cesantia: true, mot_genera_preaviso: true }

const INPUT: ProcesarLiquidacionInput = {
  historialLaboralId: 1,
  fechaSalida: '2026-01-20',
  motivoSalidaId: 5,
  diasVacacionesPendientes: 10,
}

const INSERTED = { data: { liq_id: 100 }, error: null }
const OK = { data: null, error: null }

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('procesarLiquidacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza datos inválidos', async () => {
    const result = await procesarLiquidacion({ ...INPUT, historialLaboralId: 0 })

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el empleado no existe', async () => {
    mockSupabase({ sgrh_historial_laboral: { data: null, error: null } })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'El empleado no existe o no es visible.' })
  })

  it('rechaza si el empleado ya tiene una salida registrada', async () => {
    mockSupabase({
      sgrh_historial_laboral: {
        data: { ...HISTORIAL, lab_fecha_fin: '2025-01-01' },
        error: null,
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'Este empleado ya tiene una salida registrada.' })
  })

  it('rechaza si el motivo de salida no existe', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_cat_motivos_salida: { data: null, error: null },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'El motivo de salida no existe.' })
  })

  it('con un motivo que NO genera cesantía ni preaviso, los guarda en 0', async () => {
    mockSupabase({
      sgrh_historial_laboral: [{ data: HISTORIAL, error: null }, OK],
      sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_liquidaciones: INSERTED,
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: true,
      data: {
        liqId: 100,
        salarioProporcional: 200000, // salarioDiario 10000 * 20 días trabajados
        aguinaldoProporcional: 0, // sin historial de pagos previos
        vacacionesPagadas: 100000, // 10000 * 10 días pendientes
        diasPreaviso: 0,
        preaviso: 0,
        diasCesantia: 0,
        cesantia: 0,
        total: 300000,
      },
    })
  })

  it('con un motivo que SÍ genera cesantía y preaviso, calcula ambos montos', async () => {
    mockSupabase({
      sgrh_historial_laboral: [{ data: HISTORIAL, error: null }, OK],
      sgrh_cat_motivos_salida: { data: MOTIVO_CON_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_liquidaciones: INSERTED,
    })

    const result = await procesarLiquidacion({ ...INPUT, motivoSalidaId: 6 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 6 años de antigüedad exactos (2020-01-15 → 2026-01-20).
    expect(result.data.diasPreaviso).toBe(30)
    expect(result.data.preaviso).toBe(300000)
    expect(result.data.diasCesantia).toBeCloseTo(123.74)
    expect(result.data.cesantia).toBeCloseTo(1237400)
    expect(result.data.total).toBeCloseTo(1837400)
  })

  it('si ya existe una liquidación para el empleado (23505), avisa con un mensaje claro', async () => {
    mockSupabase({
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_liquidaciones: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe una liquidación guardada para este empleado.',
    })
  })

  it('si falla el guardado por otro motivo, avisa con un mensaje genérico en vez de asumir que ya existía o filtrar el error interno', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSupabase({
      sgrh_historial_laboral: { data: HISTORIAL, error: null },
      sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_liquidaciones: {
        data: null,
        error: { code: '42501', message: 'permission denied for table sgrh_liquidaciones' },
      },
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo guardar la liquidación. Intentá de nuevo o avisá a soporte.',
    })
    consoleErrorSpy.mockRestore()
  })

  it('si se guarda pero no se puede cerrar el expediente, avisa para revisarlo a mano', async () => {
    mockSupabase({
      sgrh_historial_laboral: [
        { data: HISTORIAL, error: null },
        { data: null, error: { message: 'boom' } },
      ],
      sgrh_cat_motivos_salida: { data: MOTIVO_SIN_DERECHOS, error: null },
      sgrh_nomina_detalle: { data: [], error: null },
      sgrh_liquidaciones: INSERTED,
    })

    const result = await procesarLiquidacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error:
        'La liquidación se calculó y se guardó, pero no se pudo cerrar el expediente del empleado. Revisalo manualmente en Historial Laboral.',
    })
  })
})
