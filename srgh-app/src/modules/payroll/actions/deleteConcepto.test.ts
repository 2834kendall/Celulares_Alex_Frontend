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

/**
 * La acción lee primero qué concepto es (para no dejar borrar el BASE) y
 * después intenta el borrado, así que la cola del mock empieza por esa lectura.
 */
function mockDelete(respuestas: { data: unknown; error: unknown }[], codigoActual = 'DED004') {
  mockCreateClient.mockResolvedValue(
    createSupabaseClientMock({
      sgrh_cat_conceptos_nomina: [
        { data: { con_codigo: codigoActual }, error: null },
        ...respuestas,
      ],
    }) as unknown as Awaited<ReturnType<typeof createClient>>
  )
}

describe('deleteConcepto (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof requirePermission>>
    )
  })

  it('borra el concepto cuando no está en uso', async () => {
    mockDelete([{ data: null, error: null }])

    const result = await deleteConcepto(1)

    expect(result).toEqual({ ok: true })
  })

  it('desactiva el concepto en vez de borrarlo si ya se usó en una planilla (FK)', async () => {
    mockDelete([
      { data: null, error: { code: '23503', message: 'fk violation' } },
      { data: null, error: null },
    ])

    const result = await deleteConcepto(6)

    expect(result).toEqual({ ok: true })
  })

  it('devuelve error si tampoco se puede desactivar', async () => {
    mockDelete([
      { data: null, error: { code: '23503', message: 'fk violation' } },
      { data: null, error: { message: 'boom' } },
    ])

    const result = await deleteConcepto(6)

    expect(result).toEqual({ ok: false, error: 'No se pudo eliminar el concepto.' })
  })

  // Borrarlo no falla acá: el motor busca ese código para pagar el salario de
  // la quincena, así que la planilla siguiente saldría en ₡0 con las horas
  // bien. Y el camino largo (borrado bloqueado por FK → desactivar) hacía el
  // mismo daño sin decir nada.
  it('no deja borrar ni desactivar el concepto BASE', async () => {
    mockDelete([{ data: null, error: null }], 'BASE')

    const result = await deleteConcepto(21)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('₡0')
  })
})
