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
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    await savePostulacionScores(INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('hace upsert con onConflict por (postulacion, criterio) y excluye el puntaje de los no_aplica', async () => {
    const client = mockClient({
      sgrh_postulacion_puntajes: { data: null, error: null },
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
      sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null },
    })

    const result = await savePostulacionScores(INPUT)

    // averageScore([8, 6]) redondeado = 7
    expect(result).toEqual({ ok: true, promedio: 7 })
    const postulacionBuilder = client.from.mock.results[1].value
    expect(postulacionBuilder.update).toHaveBeenCalledWith({ pos_puntaje_promedio: 7 })
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
      sgrh_postulaciones: { data: { pos_candidato_id: 77 }, error: null },
    })

    await savePostulacionScores(INPUT)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
