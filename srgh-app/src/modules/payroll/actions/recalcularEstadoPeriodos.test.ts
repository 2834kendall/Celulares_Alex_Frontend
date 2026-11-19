import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recalcularEstadoPeriodos } from './recalcularEstadoPeriodos'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { sincronizarEstadoPeriodo } from '@/modules/payroll/lib/estadoPeriodoData'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({ getFiltroMarca: vi.fn() }))
vi.mock('@/modules/payroll/lib/estadoPeriodoData', () => ({ sincronizarEstadoPeriodo: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockSincronizar = vi.mocked(sincronizarEstadoPeriodo)

function cuenta(sucursalIds?: number[]) {
  vi.mocked(requirePermission).mockResolvedValue({
    app_metadata: sucursalIds ? { sucursal_ids: sucursalIds } : {},
  } as unknown as Awaited<ReturnType<typeof requirePermission>>)
}

function cliente(lecturas: { data: unknown; error: unknown }[]) {
  const client = createSupabaseClientMock({ sgrh_nomina_periodo: lecturas })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('recalcularEstadoPeriodos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('una cuenta con sucursal asignada no puede', async () => {
    cuenta([2])

    const result = await recalcularEstadoPeriodos()

    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('recalcula cada periodo y cuenta cuántos cambiaron', async () => {
    cuenta()
    cliente([
      {
        data: [
          { npe_id: 1, npe_estado: 'pagado' },
          { npe_id: 2, npe_estado: 'borrador' },
          { npe_id: 3, npe_estado: 'borrador' },
        ],
        error: null,
      },
      {
        data: [
          { npe_id: 1, npe_estado: 'pagado' },
          { npe_id: 2, npe_estado: 'pagado' },
          { npe_id: 3, npe_estado: 'borrador' },
        ],
        error: null,
      },
    ])

    const result = await recalcularEstadoPeriodos()

    expect(result).toEqual({ ok: true, revisados: 3, cambiaron: 1, cambiaronFechaPago: 0 })
    expect(mockSincronizar.mock.calls.map((c) => c[1])).toEqual([1, 2, 3])
  })

  // La fecha sale del pago más reciente de sus filas: puede moverse aunque el
  // estado siga igual, y eso también se informa.
  it('cuenta aparte los periodos que cambiaron de fecha de pago con el mismo estado', async () => {
    cuenta()
    cliente([
      {
        data: [
          { npe_id: 1, npe_estado: 'pagado', npe_fecha_pago: '2026-07-10' },
          { npe_id: 2, npe_estado: 'borrador', npe_fecha_pago: null },
          { npe_id: 3, npe_estado: 'pagado', npe_fecha_pago: '2026-07-20' },
          { npe_id: 4, npe_estado: 'pagado', npe_fecha_pago: '2026-07-25' },
        ],
        error: null,
      },
      {
        data: [
          { npe_id: 1, npe_estado: 'pagado', npe_fecha_pago: '2026-07-12' },
          { npe_id: 2, npe_estado: 'pagado', npe_fecha_pago: '2026-07-14' },
          { npe_id: 3, npe_estado: 'pagado', npe_fecha_pago: '2026-07-20' },
          { npe_id: 4, npe_estado: 'borrador', npe_fecha_pago: null },
        ],
        error: null,
      },
    ])

    const result = await recalcularEstadoPeriodos()

    // 2 y 4 cambiaron de estado (su fecha cambió con él); solo el 1 cambió de
    // fecha con el mismo estado; el 3 no cambió.
    expect(result).toEqual({ ok: true, revisados: 4, cambiaron: 2, cambiaronFechaPago: 1 })
  })

  // Un mock devuelve lo que se le diga: sin pedir la columna, la fecha llegaría
  // vacía en las dos lecturas y nunca se vería un cambio.
  it('pide la fecha de pago de cada periodo, antes y después', async () => {
    cuenta()
    const client = cliente([
      { data: [{ npe_id: 1, npe_estado: 'pagado', npe_fecha_pago: '2026-07-10' }], error: null },
      { data: [{ npe_id: 1, npe_estado: 'pagado', npe_fecha_pago: '2026-07-10' }], error: null },
    ])

    await recalcularEstadoPeriodos()

    const pedidos = client.from.mock.results.flatMap(
      (r) => (r.value as { select: { mock: { calls: unknown[][] } } }).select.mock.calls
    )
    expect(pedidos.map((c) => String(c[0]))).toEqual([
      'npe_id, npe_estado, npe_fecha_pago',
      'npe_id, npe_estado, npe_fecha_pago',
    ])
  })

  it('si no puede leer los periodos, no recalcula nada', async () => {
    cuenta()
    cliente([{ data: null, error: { message: 'boom' } }])

    expect((await recalcularEstadoPeriodos()).ok).toBe(false)
    expect(mockSincronizar).not.toHaveBeenCalled()
  })
})
