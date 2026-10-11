import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { rejectPostulacion } from './rejectPostulacion'
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

describe('rejectPostulacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('rechaza un motivo vacío SIN tocar permisos', async () => {
    const result = await rejectPostulacion({ postulacionId: 1, motivo: 'x' })

    expect(result).toEqual({ ok: false, error: 'Indica el motivo del descarte.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({ sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null } })

    await rejectPostulacion({ postulacionId: 1, motivo: 'No cumple el perfil' })

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('solo actualiza postulaciones en_proceso (guarda de concurrencia)', async () => {
    const client = mockClient({
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    await rejectPostulacion({ postulacionId: 1, motivo: 'No cumple el perfil' })

    const builder = client.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('pos_estado_final', 'en_proceso')
  })

  it('devuelve error si la postulación ya no está en proceso', async () => {
    mockClient({ sgrh_postulaciones: { data: null, error: null } })

    const result = await rejectPostulacion({ postulacionId: 1, motivo: 'No cumple el perfil' })

    expect(result).toEqual({ ok: false, error: 'La postulación ya no está en proceso.' })
  })

  it('camino feliz: cierra como descartado y revalida', async () => {
    const client = mockClient({
      sgrh_postulaciones: { data: { pos_candidato_id: 77 }, error: null },
    })

    const result = await rejectPostulacion({ postulacionId: 1, motivo: 'No cumple el perfil' })

    expect(result).toEqual({ ok: true })
    const builder = client.from.mock.results[0].value
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        pos_estado_final: 'descartado',
        pos_motivo_descarte: 'No cumple el perfil',
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
