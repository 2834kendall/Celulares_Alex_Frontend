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
  const client = createSupabaseClientMock({
    // Sin comprobante previo: la acción emite uno al marcar el pago. Los
    // tests que quieran otro escenario lo declaran ellos.
    sgrh_comprobantes_pago: { data: null, error: null },
    ...responses,
  })
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
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        OK,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('sgrh_provisiones_anuales')
  })

  it('desmarca un pago y resta de una provisión existente', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        OK,
        { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
      ],
      sgrh_provisiones_anuales: [
        { data: { pra_id: 5, pra_monto_acumulado_aguinaldo: 300000 }, error: null },
        OK,
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })
  })

  it('no toca la provisión si el estado no cambia (llamada redundante)', async () => {
    mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        OK,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
  })

  it('el periodo pasa a "pagado" cuando el último empleado queda marcado (todos pagados)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        OK,
        // Tras marcar este, TODOS los empleados del periodo quedan pagados.
        {
          data: [
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-20' },
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-28' },
          ],
          error: null,
        },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    const llamadaPeriodo = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_periodo'
    )
    expect(llamadaPeriodo?.value.update).toHaveBeenCalledWith({
      npe_estado: 'pagado',
      npe_fecha_pago: '2026-07-28', // la más reciente entre los dos empleados
    })
  })

  it('el periodo se queda en "borrador" si todavía falta pagarle a otro empleado', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        OK,
        // Este empleado ya quedó pagado, pero otro del mismo periodo no.
        {
          data: [
            { ndt_pagado: true, ndt_fecha_pago: '2026-07-28' },
            { ndt_pagado: false, ndt_fecha_pago: null },
          ],
          error: null,
        },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })
    const llamadaPeriodo = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_nomina_periodo'
    )
    expect(llamadaPeriodo?.value.update).toHaveBeenCalledWith({
      npe_estado: 'borrador',
      npe_fecha_pago: null,
    })
  })
  // sgrh_comprobantes_pago existia desde el baseline —con indice unico, RLS y
  // columna de confirmacion del empleado— pero ningun archivo la escribia: no
  // quedaba evidencia de que el pago se hizo.
  it('emite el comprobante de pago al marcar pagado', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        OK,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, true)

    expect(result).toEqual({ ok: true })

    const comprobante = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago'
    )
    expect(comprobante).toBeDefined()

    const inserciones = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago')
      .flatMap((r) => {
        const insert = r.value.insert as { mock: { calls: unknown[][] } }
        return insert.mock.calls.map((args) => args[0] as Record<string, unknown>)
      })

    expect(inserciones).toHaveLength(1)
    expect(inserciones[0].com_nomina_detalle_id).toBe(1)
    expect(inserciones[0].com_codigo_verificacion).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('retira el comprobante al desmarcar el pago (el pago no ocurrio)', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: true }, error: null },
        OK,
        { data: [{ ndt_pagado: false, ndt_fecha_pago: null }], error: null },
      ],
      sgrh_provisiones_anuales: [
        { data: { pra_id: 3, pra_monto_acumulado_aguinaldo: 50000 }, error: null },
        OK,
      ],
      sgrh_nomina_periodo: OK,
    })

    const result = await marcarDetallePagado(1, false)

    expect(result).toEqual({ ok: true })

    const comprobante = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago'
    )
    expect(comprobante?.value.delete).toHaveBeenCalled()
  })

  it('no emite un segundo comprobante si el detalle ya tenia uno', async () => {
    const client = mockSupabase({
      sgrh_nomina_detalle: [
        { data: { ...DETALLE_BASE, ndt_pagado: false }, error: null },
        OK,
        { data: [{ ndt_pagado: true, ndt_fecha_pago: '2026-07-28' }], error: null },
      ],
      sgrh_provisiones_anuales: [{ data: null, error: null }, OK],
      sgrh_nomina_periodo: OK,
      sgrh_comprobantes_pago: { data: { com_id: 77 }, error: null },
    })

    await marcarDetallePagado(1, true)

    const inserciones = client.from.mock.results
      .filter((_, i) => client.from.mock.calls[i][0] === 'sgrh_comprobantes_pago')
      .flatMap((r) => {
        const insert = r.value.insert as { mock: { calls: unknown[][] } }
        return insert.mock.calls
      })

    expect(inserciones).toHaveLength(0)
  })
})
