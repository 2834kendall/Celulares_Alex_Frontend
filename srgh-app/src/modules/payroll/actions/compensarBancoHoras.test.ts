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
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock(responses) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

const OK = { data: null, error: null }

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

  it('marca el movimiento como compensado', async () => {
    mockSupabase({
      sgrh_banco_horas_movimientos: [
        { data: { bhm_id: 1, bhm_estado: 'pendiente' }, error: null },
        OK,
      ],
    })

    const result = await compensarBancoHoras(1)

    expect(result).toEqual({ ok: true })
  })
})
