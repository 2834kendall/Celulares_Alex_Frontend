import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchCandidates } from './searchCandidates'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

describe('candidate search', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each(['', 'a', ' ,() '])(
    'does not query for a short or empty sanitized search: %s',
    async (term) => {
      expect(await searchCandidates(term)).toEqual({ ok: true, data: [] })
      expect(requirePermission).toHaveBeenCalledWith('RECLUTAMIENTO_READ')
      expect(createClient).not.toHaveBeenCalled()
    }
  )

  it('sanitizes filter separators and limits results', async () => {
    const candidate = { cdt_id: 1, cdt_nombre: 'Ana' }
    const query = createSupabaseQueryMock({ data: [candidate], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as unknown as Awaited<
      ReturnType<typeof createClient>
    >)
    expect(await searchCandidates('  Ana,(Perez)  ')).toEqual({ ok: true, data: [candidate] })
    expect(query.or).toHaveBeenCalledWith(
      'cdt_nombre.ilike.%Ana  Perez%,cdt_apellido_1.ilike.%Ana  Perez%,cdt_numero_identificacion.ilike.%Ana  Perez%,cdt_email.ilike.%Ana  Perez%'
    )
    expect(query.limit).toHaveBeenCalledWith(20)
    expect(query.order).toHaveBeenCalledWith('cdt_apellido_1', { ascending: true })
  })

  it('does not expose provider error details', async () => {
    const query = createSupabaseQueryMock({
      data: null,
      error: { message: 'private database detail' },
    })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as unknown as Awaited<
      ReturnType<typeof createClient>
    >)
    expect(await searchCandidates('Ana')).toEqual({
      ok: false,
      error: 'No se pudo buscar candidatos.',
    })
  })

  it('requires read access even for empty terms', async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
    await expect(searchCandidates('')).rejects.toThrow('forbidden')
    expect(createClient).not.toHaveBeenCalled()
  })
})
