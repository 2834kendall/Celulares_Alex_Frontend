import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteShiftType } from './deleteShiftType'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

describe('deleteShiftType (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('devuelve error cuando el tipo de jornada esta en uso', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: null, error: { message: 'fk violation' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deleteShiftType(1)

    expect(result).toEqual({
      ok: false,
      error:
        'No se pudo eliminar el tipo de jornada. Verifique que no este en uso por algun horario.',
    })
  })

  it('elimina el tipo de jornada y revalida la ruta en exito', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_tipos_jornada: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await deleteShiftType(1)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/schedule')
  })
})
