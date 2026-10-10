import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { reorderSelectionStages } from './reorderSelectionStages'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

// Tres columnas activas. El primer from() es la lectura; los siguientes, los UPDATE.
function mockCatalogo(updateError: unknown = null) {
  const client = createSupabaseClientMock({
    sgrh_cat_etapas_seleccion: [
      { data: [{ eta_id: 10 }, { eta_id: 20 }, { eta_id: 30 }], error: null },
      { data: null, error: updateError },
    ],
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Pares [eta_id, { eta_orden, eta_fase }] escritos por los UPDATE. */
function updates(client: ReturnType<typeof mockCatalogo>) {
  return vi
    .mocked(client.from)
    .mock.results.slice(1)
    .map((r) => {
      const builder = r.value as { update: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }
      return [builder.eq.mock.calls[0]?.[1], builder.update.mock.calls[0]?.[0]]
    })
}

describe('reorderSelectionStages (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza una lista vacía o con repetidos sin pedir permiso', async () => {
    expect(await reorderSelectionStages([])).toEqual({
      ok: false,
      error: 'Orden de columnas inválido.',
    })
    expect(await reorderSelectionStages([10, 10, 20])).toEqual({
      ok: false,
      error: 'Orden de columnas inválido.',
    })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige CATALOGOS_WRITE', async () => {
    mockCatalogo()
    await reorderSelectionStages([10, 20, 30])
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('reescribe el orden de TODAS las columnas y limpia la fase', async () => {
    const client = mockCatalogo()

    const result = await reorderSelectionStages([30, 10, 20])

    expect(result).toEqual({ ok: true })
    expect(updates(client)).toEqual([
      [30, { eta_orden: 1, eta_fase: null }],
      [10, { eta_orden: 2, eta_fase: null }],
      [20, { eta_orden: 3, eta_fase: null }],
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment')
  })

  it('si la lista no coincide con las columnas activas, pide recargar y no escribe nada', async () => {
    const esperado = {
      ok: false,
      error: 'Las columnas cambiaron mientras tanto. Recargue el tablero.',
    }

    // Falta la 30: alguien la creó mientras el tablero estaba abierto.
    const conFaltante = mockCatalogo()
    expect(await reorderSelectionStages([10, 20])).toEqual(esperado)
    expect(conFaltante.from).toHaveBeenCalledTimes(1) // solo la lectura

    // Sobra la 99: alguien la eliminó.
    const conSobrante = mockCatalogo()
    expect(await reorderSelectionStages([10, 20, 99])).toEqual(esperado)
    expect(conSobrante.from).toHaveBeenCalledTimes(1)
  })

  it('devuelve error si falla un UPDATE', async () => {
    mockCatalogo({ message: 'boom' })

    const result = await reorderSelectionStages([10, 20, 30])

    expect(result).toEqual({ ok: false, error: 'No se pudo reordenar las columnas.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
