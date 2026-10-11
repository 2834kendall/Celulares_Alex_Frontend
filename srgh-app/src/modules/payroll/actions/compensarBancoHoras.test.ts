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

  describe('horas que una liquidación vieja dejó fuera', () => {
    const HUERFANO = {
      bhm_id: 1,
      bhm_estado: 'pendiente',
      bhm_created_at: '2026-08-20T10:00:00',
      sgrh_historial_laboral: {
        lab_fecha_inicio: '2025-05-09',
        sgrh_empleados: {
          sgrh_historial_laboral: [
            { sgrh_liquidaciones: { liq_id: 4, liq_fecha_salida: '2026-10-07' } },
          ],
        },
      },
      sgrh_nomina_detalle: { sgrh_nomina_periodo: { npe_fecha_inicio_periodo: '2026-08-16' } },
    }

    it('sin nota no se cierran', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: { data: HUERFANO, error: null },
      })

      const result = await compensarBancoHoras(1, '  ')

      expect(result.ok).toBe(false)
      expect(!result.ok && result.error).toContain('escribí una nota')
      expect(client.from).toHaveBeenCalledTimes(1)
    })

    it('con nota quedan compensadas y la nota se guarda', async () => {
      const client = mockSupabase({
        sgrh_banco_horas_movimientos: [
          { data: HUERFANO, error: null },
          { data: [{ bhm_id: 1 }], error: null },
        ],
      })

      const result = await compensarBancoHoras(1, ' Pagadas por transferencia el 10/10. ')

      expect(result).toEqual({ ok: true })
      const update = client.from.mock.results[1].value as {
        update: { mock: { calls: [{ bhm_estado: string; bhm_observaciones: string }][] } }
      }
      expect(update.update.mock.calls[0][0]).toMatchObject({
        bhm_estado: 'compensado',
        bhm_observaciones: 'Pagadas por transferencia el 10/10.',
      })
    })

    it('una nota demasiado larga se rechaza antes de tocar la base', async () => {
      const result = await compensarBancoHoras(1, 'x'.repeat(501))

      expect(result.ok).toBe(false)
      expect(mockCreateClient).not.toHaveBeenCalled()
    })
  })
})
