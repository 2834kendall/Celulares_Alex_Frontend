import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPuestos } from './getPuestos'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

describe('getPuestos (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devuelve error si falla la consulta', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPuestos()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los puestos.' })
  })

  it('devuelve la lista de puestos en exito', async () => {
    const puestos = [
      {
        pue_id: 1,
        pue_nombre: 'Cajero',
        pue_descripcion: null,
        pue_salario_minimo_referencia: null,
        pue_activo: true,
        pue_empresa_id: 1,
      },
    ]
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_cat_puestos: { data: puestos, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getPuestos()

    expect(result).toEqual({ ok: true, data: puestos })
  })
})
