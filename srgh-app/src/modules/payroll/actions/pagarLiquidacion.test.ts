import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pagarLiquidacion } from './pagarLiquidacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type Respuesta = { data: unknown; error: unknown }

const LIQUIDACION = {
  liq_id: 100,
  liq_historial_laboral_id: 1,
  liq_pagado: false,
  liq_dias_trabajados_mes: 5,
  liq_salario_proporcional: 50000,
  liq_aguinaldo_proporcional: 41666.67,
  liq_dias_vacaciones_pendientes: 10,
  liq_vacaciones_pagadas: 100000,
  liq_dias_preaviso: 30,
  liq_preaviso: 300000,
  liq_dias_cesantia: 129,
  liq_cesantia: 1290000,
  liq_total: 1781666.67,
  liq_deducciones_obreras: 16245,
  liq_neto: 1765421.67,
  liq_observaciones: null,
}

function mockSupabase(responses: Record<string, Respuesta | Respuesta[]> = {}) {
  const client = createSupabaseClientMock({
    sgrh_liquidaciones: [
      { data: LIQUIDACION, error: null },
      { data: null, error: null },
    ],
    sgrh_pagos_extraordinarios: { data: { pex_id: 31 }, error: null },
    ...responses,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function llamadaA(client: ReturnType<typeof mockSupabase>, tabla: string, metodo: string) {
  for (let i = 0; i < client.from.mock.calls.length; i++) {
    if (client.from.mock.calls[i][0] !== tabla) continue
    const fn = (
      client.from.mock.results[i].value as Record<string, { mock: { calls: unknown[][] } }>
    )[metodo]
    if (fn.mock.calls.length > 0) return fn.mock.calls[0][0] as Record<string, unknown>
  }
  return undefined
}

describe('pagarLiquidacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 25, 9, 0, 0))
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registra el pago con los montos guardados (sin recalcular) y la marca pagada', async () => {
    const client = mockSupabase()

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: true, pagoId: 31 })
    const pago = llamadaA(client, 'sgrh_pagos_extraordinarios', 'insert')
    expect(pago).toMatchObject({
      pex_tipo: 'liquidacion',
      pex_liquidacion_id: 100,
      pex_anio_aguinaldo: null,
      pex_historial_laboral_id: 1,
      pex_monto_bruto: 1781666.67,
      pex_deducciones: 16245,
      pex_monto_neto: 1765421.67,
      pex_fecha_pago: '2026-01-25',
    })
    const lineas = pago?.pex_lineas as { concepto: string; monto: number; dias: number | null }[]
    expect(lineas.find((l) => l.concepto === 'Cesantía')).toEqual({
      concepto: 'Cesantía',
      dias: 129,
      monto: 1290000,
    })
    expect(llamadaA(client, 'sgrh_liquidaciones', 'update')).toEqual({
      liq_pagado: true,
      liq_fecha_pago: '2026-01-25',
    })
  })

  it('no paga dos veces una liquidación ya pagada', async () => {
    const client = mockSupabase({
      sgrh_liquidaciones: { data: { ...LIQUIDACION, liq_pagado: true }, error: null },
    })

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: false, error: 'Esta liquidación ya estaba pagada.' })
    expect(llamadaA(client, 'sgrh_pagos_extraordinarios', 'insert')).toBeUndefined()
  })

  it('si ya había un pago (índice único), lo dice en vez de duplicarlo', async () => {
    mockSupabase({
      sgrh_pagos_extraordinarios: {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "sgrh_pex_liquidacion_unq"',
        },
      },
    })

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: false, error: 'Esta liquidación ya estaba pagada.' })
  })

  it('si choca el código de verificación, reintenta con otro', async () => {
    const client = mockSupabase({
      sgrh_pagos_extraordinarios: [
        {
          data: null,
          error: {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "sgrh_pagos_extraordinarios_pex_codigo_verificacion_key"',
          },
        },
        { data: { pex_id: 32 }, error: null },
      ],
    })

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: true, pagoId: 32 })
    expect(
      client.from.mock.calls.filter((c) => c[0] === 'sgrh_pagos_extraordinarios')
    ).toHaveLength(2)
  })

  it('una liquidación que no existe', async () => {
    mockSupabase({ sgrh_liquidaciones: { data: null, error: null } })

    const result = await pagarLiquidacion(100)

    expect(result).toEqual({ ok: false, error: 'La liquidación no existe o no es visible.' })
  })

  it('rechaza un id inválido sin consultar', async () => {
    const result = await pagarLiquidacion(0)

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
