import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveEtapaSeleccion } from './moveEtapaSeleccion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

// Fase 1: 10 (orden 1), 11 (orden 2). Fase 2: 20 (orden 3), 21 (orden 4), 22 (orden 5).
const ETAPAS = [
  { eta_id: 10, eta_orden: 1, eta_fase: 1 },
  { eta_id: 11, eta_orden: 2, eta_fase: 1 },
  { eta_id: 20, eta_orden: 3, eta_fase: 2 },
  { eta_id: 21, eta_orden: 4, eta_fase: 2 },
  { eta_id: 22, eta_orden: 5, eta_fase: 2 },
]

function mockTabla(etapas = ETAPAS, updateError: unknown = null) {
  const client = createSupabaseClientMock({
    sgrh_cat_etapas_seleccion: [
      { data: etapas, error: null },
      { data: null, error: updateError },
      { data: null, error: null },
    ],
  })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Pares [eta_id, eta_orden] escritos por los UPDATE, en orden. */
function updates(client: ReturnType<typeof mockTabla>) {
  return vi
    .mocked(client.from)
    .mock.results.slice(1)
    .map((r) => {
      const builder = r.value as {
        update: ReturnType<typeof vi.fn>
        eq: ReturnType<typeof vi.fn>
      }
      return [builder.eq.mock.calls[0]?.[1], builder.update.mock.calls[0]?.[0]?.eta_orden]
    })
}

describe('moveEtapaSeleccion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un id inválido sin pedir permiso', async () => {
    const result = await moveEtapaSeleccion(0, 'arriba')
    expect(result).toEqual({ ok: false, error: 'Etapa no encontrada.' })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('exige CATALOGOS_WRITE', async () => {
    mockTabla()
    await moveEtapaSeleccion(21, 'arriba')
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('subir intercambia el orden con la vecina anterior de la MISMA fase', async () => {
    const client = mockTabla()
    const result = await moveEtapaSeleccion(21, 'arriba')

    expect(result).toEqual({ ok: true })
    expect(updates(client)).toEqual([
      [21, 3],
      [20, 4],
    ])
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })

  it('bajar intercambia con la siguiente de la misma fase', async () => {
    const client = mockTabla()
    await moveEtapaSeleccion(21, 'abajo')
    expect(updates(client)).toEqual([
      [21, 5],
      [22, 4],
    ])
  })

  it('no cruza de columna: la primera de la fase 2 no sube por encima de la fase 1', async () => {
    const client = mockTabla()
    const result = await moveEtapaSeleccion(20, 'arriba')

    expect(result).toEqual({ ok: true })
    expect(updates(client)).toEqual([])
  })

  it('con órdenes empatados las separa para que el movimiento se note', async () => {
    const client = mockTabla([
      { eta_id: 1, eta_orden: 7, eta_fase: 2 },
      { eta_id: 2, eta_orden: 7, eta_fase: 2 },
    ])
    await moveEtapaSeleccion(2, 'arriba')
    expect(updates(client)).toEqual([
      [2, 7],
      [1, 8],
    ])
  })

  it('devuelve error si falla el UPDATE', async () => {
    mockTabla(ETAPAS, { message: 'boom' })
    const result = await moveEtapaSeleccion(21, 'arriba')
    expect(result).toEqual({ ok: false, error: 'No se pudo mover la etapa.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
