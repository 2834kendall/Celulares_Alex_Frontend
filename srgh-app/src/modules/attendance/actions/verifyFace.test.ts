import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { verifyFace } from './verifyFace'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission as requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { encryptFacePayload } from '@/modules/attendance/lib/face/faceCrypto'
import type { LivenessProof } from '@/modules/attendance/lib/face/livenessProof'
import { verifyFaceTicket } from '@/modules/attendance/lib/face/faceTicket'
import { FACE_EMBEDDING_DIM } from '@/modules/attendance/lib/face/model'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))
vi.mock('@/modules/attendance/lib/liveKioskAccess', () => ({
  liveKioskMetadata: vi.fn(async (_sub, meta) => meta),
}))

const mockCreateClient = vi.mocked(createClient)

// Programacion, contratos y rostros se leen con el cliente admin (la cuenta
// KIOSCO no puede leer esas tablas). El admin del test delega en el mismo
// cliente simulado que devuelve createClient.
let clienteActual: { from: (tabla: string) => unknown } | null = null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (tabla: string) => clienteActual!.from(tabla) }),
}))

function setClient(client: unknown) {
  clienteActual = client as { from: (tabla: string) => unknown }
  mockCreateClient.mockResolvedValue(client as Awaited<ReturnType<typeof createClient>>)
}
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

/**
 * Los candidatos del reconocimiento salen de quien tiene turno HOY en la
 * sucursal del kiosco, no de quien la tiene en su contrato.
 */
const PROGRAMACION = {
  data: [10, 11].map((prg_empleado_id) => ({
    prg_historial_laboral_id: prg_empleado_id - 9,
    prg_empleado_id,
    prg_sucursal_id: 100,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
  })),
  error: null,
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

const METRICS = { escaneoMs: 1000, fps: 12.4 }

function auditInsert(client: ReturnType<typeof createSupabaseClientMock>) {
  return client.from.mock.results.find(
    (_result, index) => client.from.mock.calls[index][0] === 'sgrh_biometria_auditoria'
  )?.value.insert
}

describe('verifyFace (server action)', () => {
  it('rechaza el contexto bloqueado antes de consultar rostros', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, kiosk_error: 'Kiosco bloqueado' },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    expect(await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })).toEqual({
      ok: false,
      error: 'Kiosco bloqueado',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
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
      error: 'El reconocimiento facial no está configurado en el servidor.',
    })
  })

  it.each([
    { escaneoMs: -1, fps: 12 },
    { escaneoMs: 1000.1, fps: 12 },
    { escaneoMs: 120_001, fps: 12 },
    { escaneoMs: 1000, fps: -1 },
    { escaneoMs: 1000, fps: 240.1 },
  ])('rejects scan metrics outside the allowed bounds (%j)', async (metricas) => {
    const result = await verifyFace({
      vector: await encryptedProbe(),
      dispositivoId: null,
      metricas,
    })
    expect(result.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('falla con un payload que no descifra (basura o llave equivocada)', async () => {
    const result = await verifyFace({
      vector: { iv: btoa('123456789012'), data: btoa('no-es-un-cifrado-valido') },
      dispositivoId: null,
    })

    expect(result).toEqual({ ok: false, error: 'No se pudo procesar la verificacion facial.' })
  })

  it('falla si el kiosco no tiene sucursal asignada', async () => {
    setClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [], error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: false, error: 'Este kiosco no tiene una sucursal asignada.' })
  })

  it('cae al PIN si hoy no hay nadie con turno en esta sucursal', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: { data: [], error: null },
    })
    setClient(client as unknown as Awaited<ReturnType<typeof createClient>>)

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_biometria_empleado')
  })

  it('acota los candidatos a la sucursal del dia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: { data: [], error: null },
    })
    setClient(client as unknown as Awaited<ReturnType<typeof createClient>>)

    await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    const programacionCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
    )!.value
    expect(programacionCall.in).toHaveBeenCalledWith('prg_sucursal_id', [100])
  })

  it('MATCH de alta confianza con vector identico, con ticket firmado valido', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: PROGRAMACION,
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: {
        data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0) }],
        error: null,
      },
    })
    setClient(client)

    const result = await verifyFace({
      vector: await encryptedProbe(),
      dispositivoId: 'tablet-1',
      metricas: METRICS,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.status !== 'MATCH') throw new Error('esperaba MATCH')
    expect(result.employeeId).toBe(10)
    expect(result.fullName).toBe('Ana Perez')
    expect(result.confianza).toBe('alta')
    expect(await verifyFaceTicket(result.ticket, 10, TICKET_SECRET)).toBe(true)
    expect(auditInsert(client)).toHaveBeenCalledWith({
      bia_empresa_id: 1,
      bia_sucursal_id: 100,
      bia_resultado: 'MATCH',
      bia_mejor_empleado_id: 10,
      bia_mejor_distancia: 0,
      bia_dispositivo_id: 'tablet-1',
      bia_escaneo_ms: 1000,
      bia_fps: 12.4,
    })
  })

  it('MATCH con tolerancia en la banda 0.4-0.5 (luz/angulo)', async () => {
    setClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: PROGRAMACION,
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
    setClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: PROGRAMACION,
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
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: PROGRAMACION,
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: {
        data: [{ bio_empleado_id: 11, bio_vector: vecAtDistance(0.8) }],
        error: null,
      },
      sgrh_biometria_auditoria: { data: null, error: null },
    })
    setClient(client as unknown as Awaited<ReturnType<typeof createClient>>)

    const result = await verifyFace({
      vector: await encryptedProbe(),
      dispositivoId: 'tablet-1',
      metricas: METRICS,
    })

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
        bia_mejor_distancia: 0.8,
        bia_escaneo_ms: 1000,
        bia_fps: 12.4,
      })
    )
  })

  it('audits an undecided result without vectors or metrics with null columns', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: PROGRAMACION,
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: { data: [], error: null },
    })
    setClient(client as unknown as Awaited<ReturnType<typeof createClient>>)

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    expect(auditInsert(client)).toHaveBeenCalledWith(
      expect.objectContaining({
        bia_resultado: 'REQUIRE_PIN',
        bia_mejor_distancia: null,
        bia_mejor_empleado_id: null,
        bia_escaneo_ms: null,
        bia_fps: null,
      })
    )
  })

  it('pide otra captura si dos empleados pasan el umbral de coincidencia', async () => {
    const client = createSupabaseClientMock({
      sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
      sgrh_programacion_semanal: PROGRAMACION,
      sgrh_historial_laboral: HISTORIAL,
      sgrh_biometria_empleado: {
        data: [
          { bio_empleado_id: 10, bio_vector: vecAtDistance(0.3) },
          { bio_empleado_id: 11, bio_vector: vecAtDistance(0.05) },
        ],
        error: null,
      },
    })
    setClient(client)

    const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })

    expect(result).toEqual({ ok: true, status: 'REQUIRE_PIN' })
    expect(auditInsert(client)).toHaveBeenCalledWith(
      expect.objectContaining({
        bia_resultado: 'REQUIRE_PIN',
        bia_mejor_empleado_id: 11,
        bia_mejor_distancia: 0.05,
      })
    )
  })

  it.each(['returned error', 'thrown error'])(
    'keeps a valid match when audit fails with a %s',
    async (failure) => {
      const client = createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: PROGRAMACION,
        sgrh_historial_laboral: HISTORIAL,
        sgrh_biometria_empleado: {
          data: [{ bio_empleado_id: 10, bio_vector: vecAtDistance(0.1) }],
          error: null,
        },
        sgrh_biometria_auditoria: { data: null, error: { message: 'offline' } },
      })
      if (failure === 'thrown error') {
        const from = client.from.getMockImplementation()!
        client.from.mockImplementation((table) => {
          if (table === 'sgrh_biometria_auditoria') throw new Error('offline')
          return from(table)
        })
      }
      setClient(client)
      const result = await verifyFace({ vector: await encryptedProbe(), dispositivoId: null })
      if (!result.ok || result.status !== 'MATCH') throw new Error('Expected MATCH')
      expect(await verifyFaceTicket(result.ticket, 10, TICKET_SECRET)).toBe(true)
    }
  )

  it('ignora vectores corruptos o de otra dimension sin romperse', async () => {
    setClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: PROGRAMACION,
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
    setClient(
      createSupabaseClientMock({
        sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
        sgrh_programacion_semanal: PROGRAMACION,
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
      setClient(
        createSupabaseClientMock({
          sgrh_usuarios_empresa_rol: { data: [{ uer_sucursal_id: 100 }], error: null },
          sgrh_programacion_semanal: PROGRAMACION,
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
