import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createCandidateWithPostulacion } from './createCandidateWithPostulacion'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { NuevoCandidatoInput } from '@/modules/recruitment/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function mockClient(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

const INPUT: NuevoCandidatoInput = {
  candidato: {
    cdt_nombre: 'Ana',
    cdt_apellido_1: 'Solís',
    cdt_apellido_2: null,
    cdt_tipo_identificacion_id: 1,
    cdt_numero_identificacion: '1-2345-6789',
    cdt_email: 'ana@example.com',
    cdt_telefono: null,
    cdt_fuente_reclutamiento: null,
  },
  postulacion: {
    pos_puesto_id: 3,
    pos_sucursal_id: null,
    pos_observaciones: null,
  },
}

describe('createCandidateWithPostulacion (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza datos inválidos SIN tocar permisos', async () => {
    const result = await createCandidateWithPostulacion({
      ...INPUT,
      candidato: { ...INPUT.candidato, cdt_email: 'no-es-email' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos del candidato inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige RECLUTAMIENTO_WRITE', async () => {
    mockClient({
      sgrh_candidatos: { data: { cdt_id: 1 }, error: null },
      sgrh_postulaciones: { data: { pos_id: 1 }, error: null },
    })

    await createCandidateWithPostulacion(INPUT)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.RECLUTAMIENTO_WRITE)
  })

  it('falla si el JWT no trae empresa_id, sin crear el cliente', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await createCandidateWithPostulacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('traduce la violación de unicidad de cédula', async () => {
    mockClient({
      sgrh_candidatos: {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "sgrh_cdt_identificacion_unica"',
        },
      },
    })

    const result = await createCandidateWithPostulacion(INPUT)

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un candidato registrado con ese tipo y número de identificación.',
    })
  })

  it('si la postulación falla, revierte el candidato (rollback)', async () => {
    const client = mockClient({
      sgrh_candidatos: { data: { cdt_id: 7 }, error: null },
      sgrh_postulaciones: { data: null, error: { message: 'boom' } },
    })

    const result = await createCandidateWithPostulacion(INPUT)

    expect(result).toEqual({ ok: false, error: 'No se pudo registrar la postulación.' })
    // El tercer from() es el DELETE de reversión sobre sgrh_candidatos.
    const deleteBuilder = client.from.mock.results[2].value
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.eq).toHaveBeenCalledWith('cdt_id', 7)
  })

  it('camino feliz: crea candidato + postulación y revalida el tablero', async () => {
    mockClient({
      sgrh_candidatos: { data: { cdt_id: 7 }, error: null },
      sgrh_postulaciones: { data: { pos_id: 42 }, error: null },
    })

    const result = await createCandidateWithPostulacion(INPUT)

    expect(result).toEqual({ ok: true, candidatoId: 7, postulacionId: 42 })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/recruitment')
  })
})
