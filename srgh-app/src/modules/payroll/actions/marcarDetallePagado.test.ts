import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marcarDetallePagado } from './marcarDetallePagado'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const OK = { data: null, error: null }

const DETALLE_BASE = {
  ndt_id: 1,
  ndt_nomina_periodo_id: 9,
  ndt_historial_laboral_id: 77,
  ndt_salario_bruto: 1200000,
  sgrh_nomina_periodo: { npe_periodo_mes: 6, npe_periodo_anio: 2026 },
}

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('marcarDetallePagado (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un ndtId inválido sin llamar a Supabase', async () => {
    const result = await marcarDetallePagado(0, true)

    expect(result).toEqual({ ok: false, error: 'Detalle inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el detalle no existe', async () => {
    mockSupabase({ sgrh_nomina_detalle: { data: null, error: null } })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: false, error: 'El detalle no existe o no es visible.' })
  })

  it('devuelve error genérico si falla el update', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el estado de pago.' })
  })

  it('marca como pagado y crea la provisión de aguinaldo (no existía fila del año)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [{ data: { ...DETALLE_BASE, ndt_pagado: false }, error: null }, OK],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('sgrh_provisiones_anuales')
  })

  it('desmarca un pago y resta de una provisión existente', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [{ data: { ...DETALLE_BASE, ndt_pagado: true }, error: null }, OK],
      sgrh_provisiones_anuales: [
        { data: { pra_id: 5, pra_monto_acumulado_aguinaldo: 300000 }, error: null },
        OK,
      ],
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })
  })

  it('no toca la provisión si el estado no cambia (llamada redundante)', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [{ data: { ...DETALLE_BASE, ndt_pagado: true }, error: null }, OK],
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })
})
