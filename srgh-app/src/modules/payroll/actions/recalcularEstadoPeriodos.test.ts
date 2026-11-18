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

    expect(result).toEqual({ ok: true, revisados: 3, cambiaron: 1 })
    expect(mockSincronizar.mock.calls.map((c) => c[1])).toEqual([1, 2, 3])
  })

  it('si no puede leer los periodos, no recalcula nada', async () => {
    cuenta()
    cliente([{ data: null, error: { message: 'boom' } }])

    expect((await recalcularEstadoPeriodos()).ok).toBe(false)
    expect(mockSincronizar).not.toHaveBeenCalled()
  })
})
