import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compensarBancoHoras } from './compensarBancoHoras'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

function mockSupabase(
  responses: Record<string, { data: unknown; error: unknown } | { data: unknown; error: unknown }[]>
) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('compensarBancoHoras (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un bhmId inválido sin llamar a Supabase', async () => {
    const result = await compensarBancoHoras(0)

    expect(result).toEqual({ ok: false, error: 'Movimiento inválido.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('rechaza si el movimiento no existe', async () => {
    mockSupabase({ sgrh_banco_horas_movimientos: { data: null, error: null } })

    const result = await compensarBancoHoras(1)

    expect(result).toEqual({ ok: false, error: 'El movimiento no existe o no es visible.' })
  })

  it('rechaza si el movimiento ya fue resuelto', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: { data: { bhm_id: 1, bhm_estado: 'pagado' }, error: null },
    })

    const result = await compensarBancoHoras(1)

    expect(result).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })

  it('marca el movimiento como compensado, solo si sigue pendiente y con la hora local', async () => {
    const client = mockSupabase({
      sgrh_banco_horas_movimientos: [
        { data: { bhm_id: 1, bhm_estado: 'pendiente' }, error: null },
        { data: [{ bhm_id: 1 }], error: null },
      ],
    })

    const result = await compensarBancoHoras(1)

    expect(result).toEqual({ ok: true })
    const update = client.from.mock.results[1].value as {
      update: { mock: { calls: [{ bhm_fecha_resolucion: string }][] } }
      eq: { mock: { calls: unknown[][] } }
    }
    expect(update.eq.mock.calls).toContainEqual(['bhm_estado', 'pendiente'])
    // 'YYYY-MM-DD HH:mm:ss', sin la Z de toISOString.
    expect(update.update.mock.calls[0][0].bhm_fecha_resolucion).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
    )
  })

  it('si otro lo pagó entre la lectura y el guardado, no lo pisa', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: [
        { data: { bhm_id: 1, bhm_estado: 'pendiente' }, error: null },
        { data: [], error: null },
      ],
    })

    const result = await compensarBancoHoras(1)

    expect(result).toEqual({
      ok: false,
      error: 'Este movimiento ya fue resuelto (pagado o compensado).',
    })
  })
})
