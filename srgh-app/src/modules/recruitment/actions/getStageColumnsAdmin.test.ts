import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStageColumnsAdmin } from './getStageColumnsAdmin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)

const ETAPAS = [
  { eta_id: 20, eta_nombre: 'Entrevista', eta_orden: 2, eta_fase: null, eta_color: null },
  { eta_id: 10, eta_nombre: 'Recibido', eta_orden: 1, eta_fase: null, eta_color: '#1e3a8a' },
]

// Segunda lectura del catálogo: las desactivadas.
const INACTIVAS = {
  data: [{ eta_id: 99, eta_nombre: 'Assessment Center', eta_color: null }],
  error: null,
}

function mockTablas(tablas: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(tablas)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('getStageColumnsAdmin (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exige CATALOGOS_WRITE (no el permiso de Reclutamiento)', async () => {
    mockTablas({
      sgrh_cat_etapas_seleccion: [{ data: ETAPAS, error: null }, INACTIVAS],
      sgrh_postulaciones: { data: [], error: null },
    })

    await getStageColumnsAdmin()

    expect(requirePermission).toHaveBeenCalledWith('CATALOGOS_WRITE')
  })

  it('devuelve las columnas en el orden del tablero con sus candidatos en proceso', async () => {
    mockTablas({
      sgrh_cat_etapas_seleccion: [{ data: ETAPAS, error: null }, INACTIVAS],
      sgrh_postulaciones: {
        data: [
          { pos_etapa_actual_id: 10 },
          { pos_etapa_actual_id: 10 },
          { pos_etapa_actual_id: 20 },
          // Parada en una etapa desactivada: cuenta para esa, no para una columna.
          { pos_etapa_actual_id: 99 },
        ],
        error: null,
      },
    })

    const result = await getStageColumnsAdmin()

    expect(result).toEqual({
      ok: true,
      data: [
        { id: 10, nombre: 'Recibido', orden: 0, color: '#1e3a8a', cardCount: 2 },
        { id: 20, nombre: 'Entrevista', orden: 1, color: null, cardCount: 1 },
      ],
      inactive: [{ id: 99, nombre: 'Assessment Center', color: null, cardCount: 1 }],
    })
  })

  it('si no puede leer las postulaciones igual lista las columnas, con el conteo en 0', async () => {
    mockTablas({
      sgrh_cat_etapas_seleccion: [{ data: ETAPAS, error: null }, INACTIVAS],
      sgrh_postulaciones: { data: null, error: { message: 'permission denied' } },
    })

    const result = await getStageColumnsAdmin()

    expect(result.ok && result.data.map((stage) => stage.cardCount)).toEqual([0, 0])
  })

  it('si no puede leer las desactivadas igual lista las columnas', async () => {
    mockTablas({
      sgrh_cat_etapas_seleccion: [
        { data: ETAPAS, error: null },
        { data: null, error: { message: 'boom' } },
      ],
      sgrh_postulaciones: { data: [], error: null },
    })

    const result = await getStageColumnsAdmin()

    expect(result.ok && result.inactive).toEqual([])
    expect(result.ok && result.data).toHaveLength(2)
  })

  it('si falla el catálogo devuelve un error legible', async () => {
    mockTablas({
      sgrh_cat_etapas_seleccion: { data: null, error: { message: 'boom' } },
      sgrh_postulaciones: { data: [], error: null },
    })

    expect(await getStageColumnsAdmin()).toEqual({
      ok: false,
      error: 'No se pudieron cargar las columnas del tablero.',
    })
  })
})
