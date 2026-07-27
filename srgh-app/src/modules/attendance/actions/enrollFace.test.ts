import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { enrollFace } from './enrollFace'
import { getFaceEnrollment } from './getFaceEnrollment'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { encryptVector } from '@/modules/attendance/lib/face/faceCrypto'
import { FACE_EMBEDDING_DIM, FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)))

const RAW_VECTOR = (() => {
  // Sin normalizar a proposito: el action debe guardarlo L2-normalizado.
  const v = new Array<number>(FACE_EMBEDDING_DIM).fill(0)
  v[0] = 3
  v[1] = 4
  return v
})()

describe('enrollFace (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FACE_VECTOR_KEY', KEY)
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 50 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falla con datos invalidos', async () => {
    const result = await enrollFace({
      employeeId: -1,
      vector: { iv: 'x', data: 'y' },
    })

    expect(result).toEqual({ ok: false, error: 'Datos de enrolamiento invalidos.' })
  })

  it('falla si el servidor no tiene la llave configurada', async () => {
    vi.stubEnv('FACE_VECTOR_KEY', '')

    const result = await enrollFace({
      employeeId: 10,
      vector: await encryptVector(RAW_VECTOR, KEY),
    })

    expect(result).toEqual({
      ok: false,
      error: 'El reconocimiento facial no esta configurado en el servidor.',
    })
  })

  it('falla si el empleado no tiene contrato activo en la empresa', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await enrollFace({
      employeeId: 10,
      vector: await encryptVector(RAW_VECTOR, KEY),
    })

    expect(result).toEqual({ ok: false, error: 'El empleado no tiene un contrato activo.' })
  })

  it('guarda el vector normalizado con upsert por empleado', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 7 }, error: null },
      sgrh_biometria_empleado: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await enrollFace({
      employeeId: 10,
      vector: await encryptVector(RAW_VECTOR, KEY),
    })

    expect(result).toEqual({ ok: true })

    const bioBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_biometria_empleado'
    )
    expect(bioBuilder).toBeDefined()

    const upsert = bioBuilder!.value.upsert as ReturnType<typeof vi.fn>
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        bio_empleado_id: 10,
        bio_empresa_id: 1,
        bio_modelo: FACE_MODEL_ID,
        bio_creado_por: 50,
      }),
      { onConflict: 'bio_empleado_id' }
    )

    const stored = upsert.mock.calls[0][0].bio_vector as number[]
    expect(stored).toHaveLength(FACE_EMBEDDING_DIM)
    // 3-4-5: normalizado queda 0.6 / 0.8, norma 1.
    expect(stored[0]).toBeCloseTo(0.6)
    expect(stored[1]).toBeCloseTo(0.8)
  })

  it('devuelve error generico si el upsert falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_historial_laboral: { data: { lab_id: 7 }, error: null },
        sgrh_biometria_empleado: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await enrollFace({
      employeeId: 10,
      vector: await encryptVector(RAW_VECTOR, KEY),
    })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el registro facial.' })
  })
})

describe('getFaceEnrollment (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('devuelve los ids enrolados', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_biometria_empleado: {
          data: [{ bio_empleado_id: 10 }, { bio_empleado_id: 12 }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getFaceEnrollment()

    expect(result).toEqual({ ok: true, enrolledIds: [10, 12] })
  })

  it('devuelve error generico si la consulta falla', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_biometria_empleado: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await getFaceEnrollment()

    expect(result).toEqual({ ok: false, error: 'No se pudo cargar el estado de enrolamiento.' })
  })
})
