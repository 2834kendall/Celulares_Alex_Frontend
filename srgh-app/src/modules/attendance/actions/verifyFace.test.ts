import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { verifyFace } from './verifyFace'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { encryptFacePayload } from '@/modules/attendance/lib/face/faceCrypto'
import type { LivenessProof } from '@/modules/attendance/lib/face/livenessProof'
import { verifyFaceTicket } from '@/modules/attendance/lib/face/faceTicket'
import { FACE_EMBEDDING_DIM } from '@/modules/attendance/lib/face/model'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)))
const TICKET_SECRET = 'secreto-tickets-test'

/**
 * Vector de 128 dims a distancia euclidea exacta `d` de la sonda (que es el
 * vector cero): basta poner `d` en la primera coordenada.
 */
function vecAtDistance(d: number): number[] {
  const v = new Array<number>(FACE_EMBEDDING_DIM).fill(0)
  v[0] = d
  return v
}

const PROBE = vecAtDistance(0)

const LIVE: LivenessProof = { method: 'textura', score: 0.98, samples: 6 }

async function encryptedProbe(liveness: unknown = LIVE) {
  return encryptFacePayload({ vector: PROBE, liveness }, KEY)
}

const HISTORIAL = {
  data: [
    {
      lab_empleado_id: 10,
      sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Perez', emp_apellido_2: null },
    },
    {
      lab_empleado_id: 11,
      sgrh_empleados: { emp_nombre: 'Luis', emp_apellido_1: 'Mora', emp_apellido_2: null },
    },
  ],
  error: null,
}

describe('verifyFace (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FACE_VECTOR_KEY', KEY)
    vi.stubEnv('FACE_TICKET_SECRET', TICKET_SECRET)
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, usr_id: 50 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falla si el servidor no tiene configuradas las llaves', async () => {
    vi.stubEnv('FACE_VECTOR_KEY', '')

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({
      ok: false,
      error: 'El reconocimiento facial no esta configurado en el servidor.',
    })
  })

  it('falla con un payload que no descifra (basura o llave equivocada)', async () => {
    const result = await verifyFace({
      vector: { iv: btoa('123456789012'), data: btoa('no-es-un-cifrado-valido') },
      dispositivoId: null,
    })

    expect(result).toEqual({ ok: false, error: 'No se pudo procesar la verificacion facial.' })
  })

  it('falla si el kiosco no tiene sucursal asignada', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: null }, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: false, error: 'Este kiosco no tiene una sucursal asignada.' })
  })

  it('MATCH de alta confianza con vector identico, con ticket firmado valido', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0) }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: 'tablet-1' })

    expect(result.ok).toBe(true)
    if (!result.ok || result.status !== 'MATCH') throw new Error('esperaba MATCH')
    expect(result.employeeId).toBe(10)
    expect(result.fullName).toBe('Ana Perez')
    expect(result.confianza).toBe('alta')
    expect(await verifyFaceTicket(result.ticket, 10, TICKET_SECRET)).toBe(true)
  })

  it('MATCH con tolerancia en la banda 0.4-0.5 (luz/angulo)', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0.45) }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result.ok).toBe(true)
    if (!result.ok || result.status !== 'MATCH') throw new Error('esperaba MATCH')
    expect(result.confianza).toBe('tolerancia')
  })

  it('REQUIRE_PIN en la zona de incertidumbre 0.5-0.6', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0.55) }],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
  })

  it('DENIED sobre 0.6 y guarda el log de auditoria', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: {
        data: [{ bio_empleado_id: 11, bio_vector: vecAtDistance(0.8) }],
        error: null,
      },
      sgrh_biometria_auditoria: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: 'tablet-1' })

    expect(result).toEqual({ ok: true, status: 'DENIED' })

    const auditBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_biometria_auditoria'
    )
    expect(auditBuilder).toBeDefined()
    expect(auditBuilder!.value.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        bia_resultado: 'DENIED',
        bia_mejor_empleado_id: 11,
        bia_dispositivo_id: 'tablet-1',
      })
    )
  })

  it('sin vectores enrolados responde REQUIRE_PIN sin tocar la auditoria', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_biometria_auditoria')
  })

  it('elige al empleado mas cercano cuando hay varios enrolados', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [
            { bio_empleado_id: 10, bio_vector: vecAtDistance(0.3) },
            { bio_empleado_id: 11, bio_vector: vecAtDistance(0.05) },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result.ok).toBe(true)
    if (!result.ok || result.status !== 'MATCH') throw new Error('esperaba MATCH')
    expect(result.employeeId).toBe(11)
    expect(result.fullName).toBe('Luis Mora')
  })

  it('ignora vectores corruptos o de otra dimension sin romperse', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [
            { bio_empleado_id: 10, bio_vector: [1, 2, 3] },
            { bio_empleado_id: 11, bio_vector: 'basura' },
          ],
          error: null,
        },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
  })

  it('devuelve error generico si falla la carga de vectores', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los datos biometricos.' })
  })

  /**
   * SGRH-80. Estas pruebas son la red que evita que la prueba de vida vuelva a
   * quedar desconectada sin que nadie lo note: no verifican que el chequeo
   * FUNCIONE (de eso se encarga antispoof.test.ts) sino que este EXIGIDO. La
   * ausencia de esa distincion fue lo que dejo pasar la regresion anterior.
   */
  describe('exigencia de prueba de vida', () => {
    function conVectorCoincidente() {
      mockCreateClient.mockResolvedValue(
        createSupabaseClientMock({
          sgrh_usuarios_empresa_rol: { data: { uer_sucursal_id: 100 }, error: null },
          sgrh_historial_laboral: HISTORIAL,
          sgrh_biometria_empleado: {
            data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0) }],
            error: null,
          },
        }) as unknown as Awaited<ReturnType<typeof createClient>>
      )
    }

    it('no emite ticket si el payload no trae prueba de vida', async () => {
      conVectorCoincidente()

      // Vector identico al enrolado: sin la guarda de vida esto seria un MATCH
      // de confianza alta. Es exactamente el caso de la foto.
      const sinPrueba = await encryptFacePayload({ vector: PROBE } as never, KEY)
      const result = await verifyFace({ vector: sinPrueba, dispositivoId: null })

      expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    })

    it('no emite ticket si la prueba de vida viene nula', async () => {
      conVectorCoincidente()

      const result = await verifyFace({
        vector: await encryptedProbe(null),
        dispositivoId: null,
      })

      expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    })

    it('rechaza una prueba de vida con metodo desconocido', async () => {
      conVectorCoincidente()

      const result = await verifyFace({
        vector: await encryptedProbe({ method: 'inventado', ratio: 1, motion: 1 }),
        dispositivoId: null,
      })

      expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    })

    it('rechaza un puntaje fuera del rango 0..1', async () => {
      conVectorCoincidente()

      const result = await verifyFace({
        vector: await encryptedProbe({ method: 'textura', score: 1.5, samples: 6 }),
        dispositivoId: null,
      })

      expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    })

    it('rechaza una prueba sin muestras que la respalden', async () => {
      conVectorCoincidente()

      const result = await verifyFace({
        vector: await encryptedProbe({ method: 'textura', score: 0.99, samples: 0 }),
        dispositivoId: null,
      })

      expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    })

    it('emite ticket valido cuando la prueba de vida esta presente', async () => {
      conVectorCoincidente()

      const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

      expect(result.ok).toBe(true)
      if (!result.ok || result.status !== 'MATCH') throw new Error('esperaba MATCH')
      await expect(verifyFaceTicket(result.ticket, 10, TICKET_SECRET)).resolves.toBe(true)
    })
  })
})
