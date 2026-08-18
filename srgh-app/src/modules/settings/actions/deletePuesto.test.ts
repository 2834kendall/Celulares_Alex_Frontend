import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePuesto } from './deletePuesto'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

describe('deletePuesto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('devuelve error si el puesto esta en uso (violacion de FK)', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: { message: 'foreign key violation' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deletePuesto(1)

    expect(result).toEqual({
      ok: false,
      error:
        'No se pudo eliminar el puesto. Verifique que no este en uso por algun empleado o postulacion.',
    })
  })

  it('elimina el puesto y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deletePuesto(1)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })
})
