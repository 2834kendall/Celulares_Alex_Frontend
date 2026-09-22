import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { advanceStage } from './advanceStage'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { AvanzarEtapaInput } from '@/modules/recruitment/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { usr_id: 5 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockClient(...args: Parameters<typeof createSupabaseClientMock>) {
  const client = createSupabaseClientMock(...args)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

const INPUT: AvanzarEtapaInput = {
  postulacionId: 10,
  etapaId: 3,
  resultado: 'aprobado',
  notas: 'Buena entrevista',
  fecha: '2026-09-21',
}

describe('advanceStage (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza datos inválidos SIN tocar permisos', async () => {
    const result = await advanceStage({ ...INPUT, resultado: 'x' as never })

    expect(result).toEqual({ ok: false, error: 'Datos de la etapa inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({ sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null } })

    await advanceStage(INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('llama a la RPC con los datos parseados y el responsable del JWT', async () => {
    const client = mockClient(
      { sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null } },
      { rpcResponses: { registrar_etapa_postulacion: { data: 99, error: null } } }
    )

    await advanceStage(INPUT)

    expect(client.rpc).toHaveBeenCalledWith('registrar_etapa_postulacion', {
      p_postulacion_id: 10,
      p_etapa_id: 3,
      p_resultado: 'aprobado',
      p_fecha: '2026-09-21',
      p_notas: 'Buena entrevista',
      p_responsable_id: 5,
    })
  })

  it('omite p_notas/p_responsable_id cuando no vienen, en vez de mandar null', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)
    const client = mockClient(
      { sgrh_postulaciones: { data: { pos_candidato_id: 1 }, error: null } },
      { rpcResponses: { registrar_etapa_postulacion: { data: 99, error: null } } }
    )

    await advanceStage({ ...INPUT, notas: null })

    expect(client.rpc).toHaveBeenCalledWith('registrar_etapa_postulacion', {
      p_postulacion_id: 10,
      p_etapa_id: 3,
      p_resultado: 'aprobado',
      p_fecha: '2026-09-21',
    })
  })

  it('traduce el error de permiso (42501)', async () => {
    mockClient(
      {},
      { rpcResponses: { registrar_etapa_postulacion: { data: null, error: { code: '42501' } } } }
    )

    const result = await advanceStage(INPUT)

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para avanzar esta postulación.' })
  })

  it('camino feliz: revalida el tablero y la ficha del candidato', async () => {
    mockClient(
      { sgrh_postulaciones: { data: { pos_candidato_id: 77 }, error: null } },
      { rpcResponses: { registrar_etapa_postulacion: { data: 99, error: null } } }
    )

    const result = await advanceStage(INPUT)

    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
