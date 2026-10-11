import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { enrollFace } from './enrollFace'
import { getFaceEnrollment } from './getFaceEnrollment'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { encryptFacePayload } from '@/modules/attendance/lib/face/faceCrypto'
import type { LivenessProof } from '@/modules/attendance/lib/face/livenessProof'
import { FACE_EMBEDDING_DIM, FACE_MODEL_ID } from '@/modules/attendance/lib/face/model'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)))

const RAW_VECTOR = (() => {
  // Con magnitud no-unitaria a proposito: el action debe guardarlo TAL CUAL
  // (la distancia euclidea de dlib necesita la magnitud original — si alguien
  // reintroduce una normalizacion, este vector la delata).
  const v = new Array<number>(FACE_EMBEDDING_DIM).fill(0)
  v[0] = 3
  v[1] = 4
  return v
})()

const LIVE: LivenessProof = { method: 'textura', score: 0.98, samples: 6 }

async function encryptedEnrollment(liveness: unknown = LIVE) {
  return encryptFacePayload({ vector: RAW_VECTOR, liveness }, KEY)
}

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
      vector: await encryptedEnrollment(),
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
      vector: await encryptedEnrollment(),
    })

    expect(result).toEqual({ ok: false, error: 'El empleado no tiene un contrato activo.' })
  })

  it('guarda el vector crudo (sin normalizar) con upsert por empleado', async () => {
    const client = createSupabaseClientMock({
      sgrh_historial_laboral: { data: { lab_id: 7 }, error: null },
      sgrh_biometria_empleado: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await enrollFace({
      employeeId: 10,
      vector: await encryptedEnrollment(),
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
    // Crudo, sin normalizar: la magnitud 3-4 sobrevive intacta.
    expect(stored[0]).toBeCloseTo(3)
    expect(stored[1]).toBeCloseTo(4)
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
      vector: await encryptedEnrollment(),
    })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar el registro facial.' })
  })

  /**
   * SGRH-80. El enrolamiento exige el mismo nivel de prueba de vida que el
   * kiosco: un vector registrado desde una fotografia no caduca y deja a esa
   * persona suplantable de forma permanente.
   */
  describe('exigencia de prueba de vida', () => {
    function conContratoActivo() {
      mockCreateClient.mockResolvedValue(
        createSupabaseClientMock({
          sgrh_historial_laboral: { data: { lab_id: 7 }, error: null },
          sgrh_biometria_empleado: { data: null, error: null },
        }) as unknown as Awaited<ReturnType<typeof createClient>>
      )
    }

    it('rechaza un enrolamiento sin prueba de vida', async () => {
      conContratoActivo()

      const sinPrueba = await encryptFacePayload({ vector: RAW_VECTOR } as never, KEY)
      const result = await enrollFace({ employeeId: 10, vector: sinPrueba })

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo confirmar que haya una persona real frente a la camara.',
      })
    })

    it('rechaza una prueba de vida malformada', async () => {
      conContratoActivo()

      const result = await enrollFace({
        employeeId: 10,
        vector: await encryptedEnrollment({ method: 'planaridad', ratio: 'alto', motion: 1 }),
      })

      expect(result.ok).toBe(false)
    })

    it('acepta el enrolamiento con prueba de vida valida', async () => {
      conContratoActivo()

      const result = await enrollFace({
        employeeId: 10,
        vector: await encryptedEnrollment(),
      })

      expect(result).toEqual({ ok: true })
    })
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
