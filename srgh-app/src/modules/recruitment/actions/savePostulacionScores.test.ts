import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { savePostulacionScores } from './savePostulacionScores'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { GuardarPuntajesInput } from '@/modules/recruitment/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** Los tres criterios de INPUT con peso normal: el ponderado da igual que el simple. */
const CRITERIOS_PESO_1 = [
  { cri_id: 1, sgrh_cat_areas_seleccion: { are_peso: 1 } },
  { cri_id: 2, sgrh_cat_areas_seleccion: { are_peso: 1 } },
  { cri_id: 3, sgrh_cat_areas_seleccion: { are_peso: 1 } },
]

const INPUT: GuardarPuntajesInput = {
  postulacionId: 10,
  puntajes: [
    { criterioId: 1, puntaje: 8, noAplica: false, observacion: null },
    { criterioId: 2, puntaje: 6, noAplica: false, observacion: null },
    { criterioId: 3, puntaje: null, noAplica: true, observacion: 'No presentó certificados' },
  ],
}

describe('savePostulacionScores (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
  })

  it('rechaza datos inválidos (puntaje sin marcar no_aplica) SIN tocar permisos', async () => {
    const result = await savePostulacionScores({
      postulacionId: 10,
      puntajes: [{ criterioId: 1, puntaje: null, noAplica: false, observacion: null }],
    })

    expect(result).toEqual({ ok: false, error: 'Datos del puntaje inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: { data: CRITERIOS_PESO_1, error: null },
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    await savePostulacionScores(INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('hace upsert con onConflict por (postulacion, criterio) y excluye el puntaje de los no_aplica', async () => {
    const client = mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: { data: CRITERIOS_PESO_1, error: null },
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    await savePostulacionScores(INPUT)

    const puntajesBuilder = client.from.mock.results[0].value
    expect(puntajesBuilder.upsert).toHaveBeenCalledWith(
      [
        {
          psc_postulacion_id: 10,
          psc_criterio_id: 1,
          psc_puntaje: 8,
          psc_no_aplica: false,
          psc_observacion: null,
        },
        {
          psc_postulacion_id: 10,
          psc_criterio_id: 2,
          psc_puntaje: 6,
          psc_no_aplica: false,
          psc_observacion: null,
        },
        {
          psc_postulacion_id: 10,
          psc_criterio_id: 3,
          psc_puntaje: null,
          psc_no_aplica: true,
          psc_observacion: 'No presentó certificados',
        },
      ],
      { onConflict: 'psc_postulacion_id,psc_criterio_id' }
    )
  })

  it('recalcula el promedio SOLO con los criterios aplicables', async () => {
    const client = mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: { data: CRITERIOS_PESO_1, error: null },
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    const result = await savePostulacionScores(INPUT)

    // Con todos los pesos en 1: (8 + 6) / 2 = 7. El criterio 3 no aplica.
    expect(result).toEqual({ ok: true, promedio: 7 })
    // 0 = upsert de puntajes, 1 = lectura de pesos, 2 = update del promedio.
    const postulacionBuilder = client.from.mock.results[2].value
    expect(postulacionBuilder.update).toHaveBeenCalledWith({ pos_puntaje_promedio: 7 })
  })

  it('pondera por are_peso: el criterio que pesa más arrastra el promedio', async () => {
    mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: {
        // El 6 ahora vale el triple que el 8.
        data: [
          { cri_id: 1, sgrh_cat_areas_seleccion: { are_peso: 1 } },
          { cri_id: 2, sgrh_cat_areas_seleccion: { are_peso: 3 } },
          { cri_id: 3, sgrh_cat_areas_seleccion: { are_peso: 1 } },
        ],
        error: null,
      },
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    const result = await savePostulacionScores({
      postulacionId: 10,
      puntajes: [
        { criterioId: 1, puntaje: 10, noAplica: false, observacion: null },
        { criterioId: 2, puntaje: 4, noAplica: false, observacion: null },
      ],
    })

    // Simple daría (10 + 4) / 2 = 7. Ponderado: (10*1 + 4*3) / 4 = 5.5 → 6.
    expect(result).toEqual({ ok: true, promedio: 6 })
  })

  it('los pesos salen de la base, no del cliente', async () => {
    const client = mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: { data: CRITERIOS_PESO_1, error: null },
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    await savePostulacionScores(INPUT)

    // Se consulta el catálogo acotado a los criterios que vinieron en el
    // formulario: si el peso viajara en el input, alguien podría inflar el
    // suyo y torcer el promedio.
    const criteriosBuilder = client.from.mock.results[1].value
    expect(client.from).toHaveBeenCalledWith('sgrh_cat_criterios_seleccion')
    expect(criteriosBuilder.in).toHaveBeenCalledWith('cri_id', [1, 2, 3])
  })

  it('si el upsert falla, no toca sgrh_postulaciones', async () => {
    const client = mockClient({
      sgrh_postulacion_puntajes: { data: null, error: { message: 'boom' } },
    })

    const result = await savePostulacionScores(INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el puntaje.' })
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('camino feliz: revalida el tablero y la ficha del candidato', async () => {
    mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
      sgrh_cat_criterios_seleccion: { data: CRITERIOS_PESO_1, error: null },
      sgrh_postulaciones: { data: { pos_candidato_id: 77 }, error: null },
    })

    await savePostulacionScores(INPUT)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
