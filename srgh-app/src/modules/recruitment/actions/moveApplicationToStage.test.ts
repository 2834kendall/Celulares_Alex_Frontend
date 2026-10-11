import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { moveApplicationToStage } from './moveApplicationToStage'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { MoveToStageInput } from '@/modules/recruitment/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/modules/attendance/lib/time', () => ({ todayInCostaRica: () => '2026-10-10' }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { usr_id: 5 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const INPUT: MoveToStageInput = { applicationId: 10, stageId: 3 }

// Postulación en proceso parada en la etapa 2; destino: la etapa 3, activa.
function tablas(overrides: Record<string, unknown> = {}) {
  return {
    sgrh_postulaciones: {
      data: { pos_candidato_id: 77, pos_estado_final: 'en_proceso', pos_etapa_actual_id: 2 },
      error: null,
    },
    sgrh_cat_etapas_seleccion: { data: { eta_activo: true }, error: null },
    ...overrides,
  }
}

function mockClient(...args: Parameters<typeof createSupabaseClientMock>) {
  const client = createSupabaseClientMock(...args)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

describe('moveApplicationToStage (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza datos inválidos SIN tocar permisos', async () => {
    const result = await moveApplicationToStage({ applicationId: 0, stageId: 3 })

    expect(result).toEqual({ ok: false, error: 'Datos del movimiento inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient(tablas())
    await moveApplicationToStage(INPUT)
    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('registra el movimiento SIN resultado, con la fecha del servidor y el responsable del JWT', async () => {
    const client = mockClient(tablas())

    const result = await moveApplicationToStage({ ...INPUT, note: 'Buena entrevista' })

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalledWith('registrar_etapa_postulacion', {
      p_postulacion_id: 10,
      p_etapa_id: 3,
      p_resultado: null,
      p_fecha: '2026-10-10',
      p_notas: 'Buena entrevista',
      p_responsable_id: 5,
    })
  })

  it('se puede mover HACIA ATRÁS: el tablero es libre', async () => {
    // Está en la 5 y vuelve a la 3. Antes de SGRH-96 esto se rechazaba.
    const client = mockClient(
      tablas({
        sgrh_postulaciones: {
          data: { pos_candidato_id: 77, pos_estado_final: 'en_proceso', pos_etapa_actual_id: 5 },
          error: null,
        },
      })
    )

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).toHaveBeenCalled()
  })

  it('soltarla en su misma columna no registra nada en el historial', async () => {
    const client = mockClient(
      tablas({
        sgrh_postulaciones: {
          data: { pos_candidato_id: 77, pos_estado_final: 'en_proceso', pos_etapa_actual_id: 3 },
          error: null,
        },
      })
    )

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: true })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una postulación ya cerrada', async () => {
    const client = mockClient(
      tablas({
        sgrh_postulaciones: {
          data: { pos_candidato_id: 77, pos_estado_final: 'contratado', pos_etapa_actual_id: 2 },
          error: null,
        },
      })
    )

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: false, error: 'La postulación ya está cerrada.' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una columna que ya no existe (etapa desactivada)', async () => {
    const client = mockClient(
      tablas({ sgrh_cat_etapas_seleccion: { data: { eta_activo: false }, error: null } })
    )

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: false, error: 'Esa columna ya no existe. Recargue el tablero.' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('postulación inexistente (o de otra empresa, invisible por RLS)', async () => {
    mockClient(tablas({ sgrh_postulaciones: { data: null, error: null } }))

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: false, error: 'Postulación no encontrada.' })
  })

  it('traduce el error de permiso de la base (42501)', async () => {
    mockClient(tablas(), {
      rpcResponses: { registrar_etapa_postulacion: { data: null, error: { code: '42501' } } },
    })

    const result = await moveApplicationToStage(INPUT)

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para mover esta postulación.' })
  })

  it('camino feliz: revalida el tablero y la ficha del candidato', async () => {
    mockClient(tablas())

    await moveApplicationToStage(INPUT)

    expect(revalidatePath).toHaveBeenCalledWith('/recruitment')
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment/candidates/77')
  })
})
