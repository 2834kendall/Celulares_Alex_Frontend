import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { restoreSelectionStage } from './restoreSelectionStage'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

// El primer from() lee el último orden del catálogo; el segundo es el UPDATE.
function mockCatalogo(update: { data: unknown; error: unknown }, lastOrder: number | null = 7) {
  const client = createSupabaseClientMock({
    sgrh_cat_etapas_seleccion: [
      { data: lastOrder === null ? null : { eta_orden: lastOrder }, error: null },
      update,
    ],
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('restoreSelectionStage (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un id inválido sin pedir permiso', async () => {
    expect(await restoreSelectionStage(0)).toEqual({ ok: false, error: 'Etapa no encontrada.' })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige CATALOGOS_WRITE', async () => {
    mockCatalogo({ data: [{ eta_id: 4 }], error: null })
    await restoreSelectionStage(4)
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('la reactiva como ÚLTIMA columna y sin fase, solo si seguía desactivada', async () => {
    const client = mockCatalogo({ data: [{ eta_id: 4 }], error: null }, 7)

    const result = await restoreSelectionStage(4)

    expect(result).toEqual({ ok: true })
    const update = vi.mocked(client.from).mock.results[1].value as {
      update: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
    }
    expect(update.update).toHaveBeenCalledWith({ eta_activo: true, eta_fase: null, eta_orden: 8 })
    expect(update.eq).toHaveBeenCalledWith('eta_id', 4)
    expect(update.eq).toHaveBeenCalledWith('eta_activo', false)
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(revalidatePath).toHaveBeenCalledWith('/settings/recruitment/stages')
  })

  it('si ya no estaba desactivada (otra persona la restauró) no toca nada y avisa', async () => {
    mockCatalogo({ data: [], error: null })

    const result = await restoreSelectionStage(4)

    expect(result).toEqual({
      ok: false,
      error: 'Esa etapa ya no está desactivada. Recargue la página.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la base', async () => {
    mockCatalogo({ data: null, error: { message: 'boom' } })

    expect(await restoreSelectionStage(4)).toEqual({
      ok: false,
      error: 'No se pudo restaurar la etapa.',
    })
  })
})
