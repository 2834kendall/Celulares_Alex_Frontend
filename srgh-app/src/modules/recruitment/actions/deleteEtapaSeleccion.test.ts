import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteEtapaSeleccion } from './deleteEtapaSeleccion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

/**
 * `enColumna` = postulaciones en proceso paradas en la columna. El conteo
 * viaja en `count` (select con head: true), no en `data`.
 */
function mockTablas(enColumna: number, catalogo: unknown[]) {
  const client = createSupabaseClientMock({
    sgrh_postulaciones: { data: null, error: null, count: enColumna } as never,
    sgrh_cat_etapas_seleccion: catalogo as never,
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('deleteEtapaSeleccion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exige CATALOGOS_WRITE', async () => {
    mockTablas(0, [{ data: null, error: null }])
    await deleteEtapaSeleccion(4)
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('no elimina una columna que todavía tiene candidatos', async () => {
    const client = mockTablas(2, [{ data: null, error: null }])

    const result = await deleteEtapaSeleccion(4)

    expect(result).toEqual({
      ok: false,
      error: 'Hay 2 candidatos en esta columna. Muévalos a otra antes de eliminarla.',
    })
    // Solo se consultó el conteo: el catálogo ni se tocó.
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('sgrh_postulaciones')
  })

  it('con un solo candidato el aviso va en singular', async () => {
    mockTablas(1, [{ data: null, error: null }])

    const result = await deleteEtapaSeleccion(4)

    expect(result).toEqual({
      ok: false,
      error: 'Hay 1 candidato en esta columna. Muévalo a otra antes de eliminarla.',
    })
  })

  it('vacía y sin historial: se borra del todo', async () => {
    const client = mockTablas(0, [{ data: null, error: null }])

    const result = await deleteEtapaSeleccion(4)

    expect(result).toEqual({ ok: true })
    const catalogo = vi.mocked(client.from).mock.results[1].value as {
      delete: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    expect(catalogo.delete).toHaveBeenCalled()
    expect(catalogo.update).not.toHaveBeenCalled()
  })

  it('vacía pero con historial (la FK impide borrarla): se desactiva', async () => {
    const client = mockTablas(0, [
      { data: null, error: { code: '23503' } }, // DELETE rechazado por la FK
      { data: null, error: null }, // UPDATE eta_activo = false
    ])

    const result = await deleteEtapaSeleccion(4)

    expect(result).toEqual({ ok: true })
    const desactivar = vi.mocked(client.from).mock.results[2].value as {
      update: ReturnType<typeof vi.fn>
    }
    expect(desactivar.update).toHaveBeenCalledWith({ eta_activo: false })
  })
})
