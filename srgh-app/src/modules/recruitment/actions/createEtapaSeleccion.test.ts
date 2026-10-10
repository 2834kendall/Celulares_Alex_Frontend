import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEtapaSeleccion } from './createEtapaSeleccion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

// from() #1: último orden del catálogo · #2: INSERT · #3: quién tiene ese nombre.
function mockCatalogo(...steps: { data: unknown; error: unknown }[]) {
  const client = createSupabaseClientMock({ sgrh_cat_etapas_seleccion: steps })
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('createEtapaSeleccion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rechaza un nombre vacío sin pedir permiso', async () => {
    const result = await createEtapaSeleccion({ nombre: '', color: null })

    expect(result).toEqual({ ok: false, error: 'Datos de la columna inválidos.' })
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it('crea la columna al final del tablero, sin fase', async () => {
    const client = mockCatalogo(
      { data: { eta_orden: 5 }, error: null },
      { data: { eta_id: 40 }, error: null }
    )

    const result = await createEtapaSeleccion({ nombre: 'Prueba práctica', color: '#1e3a8a' })

    expect(result).toEqual({ ok: true, id: 40 })
    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
    const insert = vi.mocked(client.from).mock.results[1].value as {
      insert: ReturnType<typeof vi.fn>
    }
    expect(insert.insert).toHaveBeenCalledWith({
      eta_nombre: 'Prueba práctica',
      eta_fase: null,
      eta_color: '#1e3a8a',
      eta_orden: 6,
      eta_activo: true,
    })
  })

  it('nombre repetido contra una etapa DESACTIVADA: dice dónde restaurarla', async () => {
    mockCatalogo(
      { data: { eta_orden: 5 }, error: null },
      { data: null, error: { code: '23505' } },
      { data: { eta_activo: false }, error: null }
    )

    const result = await createEtapaSeleccion({ nombre: 'Prueba Técnica', color: null })

    expect(result).toEqual({
      ok: false,
      error:
        'Ya existe una etapa desactivada con ese nombre. Restáurela desde Configuración → Etapas de selección.',
    })
  })

  it('nombre repetido contra una columna del tablero', async () => {
    mockCatalogo(
      { data: { eta_orden: 5 }, error: null },
      { data: null, error: { code: '23505' } },
      { data: { eta_activo: true }, error: null }
    )

    expect(await createEtapaSeleccion({ nombre: 'Entrevista', color: null })).toEqual({
      ok: false,
      error: 'Ya existe una columna con ese nombre.',
    })
  })

  it('otro error de la base devuelve un mensaje genérico', async () => {
    mockCatalogo({ data: { eta_orden: 5 }, error: null }, { data: null, error: { code: 'XX000' } })

    expect(await createEtapaSeleccion({ nombre: 'Entrevista', color: null })).toEqual({
      ok: false,
      error: 'No se pudo crear la columna.',
    })
  })
})
