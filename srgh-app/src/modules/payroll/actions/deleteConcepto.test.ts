import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteConcepto } from './deleteConcepto'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

describe('deleteConcepto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('borra el concepto cuando no está en uso', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_conceptos_nomina: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deleteConcepto(1)

    expect(result).toEqual({ ok: true })
  })

  it('desactiva el concepto en vez de borrarlo si ya se usó en una planilla (FK)', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_conceptos_nomina: [
          { data: null, error: { code: '23503', message: 'fk violation' } },
          { data: null, error: null },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deleteConcepto(6)

    expect(result).toEqual({ ok: true })
  })

  it('devuelve error si tampoco se puede desactivar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_conceptos_nomina: [
          { data: null, error: { code: '23503', message: 'fk violation' } },
          { data: null, error: { message: 'boom' } },
        ],
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deleteConcepto(6)

    expect(result).toEqual({ ok: false, error: 'No se pudo eliminar el concepto.' })
  })
})
