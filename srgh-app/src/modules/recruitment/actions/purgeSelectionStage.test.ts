import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { purgeSelectionStage } from './purgeSelectionStage'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

function mockDelete(result: { data: unknown; error: unknown }) {
  const client = createSupabaseClientMock({ sgrh_cat_etapas_seleccion: result })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('purgeSelectionStage (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un id inválido sin pedir permiso', async () => {
    expect(await purgeSelectionStage(-1)).toEqual({ ok: false, error: 'Etapa no encontrada.' })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige CATALOGOS_WRITE', async () => {
    mockDelete({ data: [{ eta_id: 4 }], error: null })
    await purgeSelectionStage(4)
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('borra SOLO si la etapa está desactivada: nunca una columna del tablero', async () => {
    const client = mockDelete({ data: [{ eta_id: 4 }], error: null })

    const result = await purgeSelectionStage(4)

    expect(result).toEqual({ ok: true })
    const query = vi.mocked(client.from).mock.results[0].value as {
      delete: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
    }
    expect(query.delete).toHaveBeenCalled()
    expect(query.eq).toHaveBeenCalledWith('eta_id', 4)
    expect(query.eq).toHaveBeenCalledWith('eta_activo', false)
    expect(revalidatePath).toHaveBeenCalledWith('/settings/recruitment/stages')
  })

  it('si algún candidato pasó por ella (FK) no se borra y explica por qué', async () => {
    mockDelete({ data: null, error: { code: '23503' } })

    const result = await purgeSelectionStage(4)

    expect(result).toEqual({
      ok: false,
      error:
        'No se puede eliminar del todo: hay candidatos que pasaron por esta etapa. Queda desactivada para conservar su historial.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si no borró ninguna fila (ya estaba activa o no existe) avisa', async () => {
    mockDelete({ data: [], error: null })

    expect(await purgeSelectionStage(4)).toEqual({
      ok: false,
      error: 'Esa etapa ya no está desactivada. Recargue la página.',
    })
  })
})
