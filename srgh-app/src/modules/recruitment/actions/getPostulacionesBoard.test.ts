import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPostulacionesBoard } from './getPostulacionesBoard'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { fetchStageColumns } from '@/modules/recruitment/lib/stageColumns'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/empresa/contexto-activo', () => ({
  ERROR_FILTRO_MARCA: 'No se pudo aplicar el filtro de marca.',
  getFiltroMarca: vi.fn(async () => ({ estado: 'sin-filtro', sucursalIds: null })),
}))
vi.mock('@/modules/recruitment/lib/stageColumns', () => ({ fetchStageColumns: vi.fn() }))

function conTablero() {
  const client = createSupabaseClientMock({ sgrh_postulaciones: { data: [], error: null } })
  vi.mocked(createClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof createClient>>
  )
  return client.from.mock.results
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requirePermission).mockResolvedValue({} as never)
  vi.mocked(fetchStageColumns).mockResolvedValue([])
})

describe('getPostulacionesBoard con una marca elegida', () => {
  it('lee solo las postulaciones de sus tiendas', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce({
      estado: 'filtrado',
      marcaId: 1,
      sucursalIds: [5, 6],
    })
    const resultados = conTablero()

    await getPostulacionesBoard()

    expect(resultados[0].value.in).toHaveBeenCalledWith('pos_sucursal_id', [5, 6])
  })

  it('sin marca no acota: una postulación sin tienda sale en "Todas"', async () => {
    const resultados = conTablero()

    await getPostulacionesBoard()

    expect(resultados[0].value.in).not.toHaveBeenCalled()
  })

  it('si no se pudo leer el filtro da error', async () => {
    vi.mocked(getFiltroMarca).mockResolvedValueOnce({ estado: 'error', sucursalIds: null })

    expect(await getPostulacionesBoard()).toEqual({
      ok: false,
      error: 'No se pudo aplicar el filtro de marca.',
    })
    expect(createClient).not.toHaveBeenCalled()
  })
})
