import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { linkPostulacionToEmployee } from './linkPostulacionToEmployee'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('linkPostulacionToEmployee (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza ids inválidos SIN tocar permisos', async () => {
    expect(await linkPostulacionToEmployee(0, 5)).toEqual({
      ok: false,
      error: 'Postulación no encontrada.',
    })
    expect(await linkPostulacionToEmployee(1, 0)).toEqual({
      ok: false,
      error: 'Empleado no encontrado.',
    })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({ sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null } })

    await linkPostulacionToEmployee(1, 10)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('camino feliz: marca contratado, enlaza el empleado y revalida', async () => {
    const client = mockClient({
      sgrh_postulaciones: { data: { pos_candidato_id: 77 }, error: null },
    })

    const result = await linkPostulacionToEmployee(1, 10)

    expect(result).toEqual({ ok: true })
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ pos_estado_final: 'contratado', pos_empleado_id: 10 })
    )
    expect(builder.eq).toHaveBeenCalledWith('pos_estado_final', 'en_proceso')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
