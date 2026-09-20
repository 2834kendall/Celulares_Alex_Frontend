import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerKioskMark } from './registerKioskMark'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission as requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { signFaceTicket } from '@/modules/attendance/lib/face/faceTicket'
import type { KioskMarkInput } from '@/modules/attendance/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Jornada y ausencias se leen con el cliente admin (la cuenta KIOSCO no puede
// leer esas tablas). El admin del test delega en el mismo cliente del test,
// salvo sgrh_ausencias, que por defecto viene vacia: nadie tiene ausencia.
let ausenciasAdmin: { data: unknown; error: unknown } = { data: [], error: null }
let clienteActual: { from: (tabla: string) => unknown } | null = null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) =>
      tabla === 'sgrh_ausencias'
        ? createSupabaseClientMock({ sgrh_ausencias: ausenciasAdmin }).from(tabla)
        : clienteActual!.from(tabla),
  }),
}))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type ClientMock = ReturnType<typeof createSupabaseClientMock>

const TICKET_SECRET = 'secreto-tickets-test'

/**
 * Turno del dia que habilita a marcar. Sin una fila asi, registerKioskMark
 * rechaza: tener contrato activo ya no alcanza.
 */
const ASSIGNMENT = {
  prg_historial_laboral_id: 1,
  prg_empleado_id: 10,
  prg_sucursal_id: 100,
  prg_es_dia_libre: false,
  prg_es_feriado: false,
  prg_hora_entrada_custom: null,
  sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
}

/** Marca con un ticket de Face ID recien emitido para el empleado 10. */
async function validInput(overrides: Partial<KioskMarkInput> = {}): Promise<KioskMarkInput> {
  return {
    employeeId: 10,
    tipo: 'entrada',
    latitud: null,
    longitud: null,
    dispositivoId: null,
    ticketFacial: await signFaceTicket(10, TICKET_SECRET),
    ...overrides,
  }
}

/** Turno, contrato y jornada vacia: todo lo que una entrada valida atraviesa. */
function clientConTurno(overrides: Record<string, unknown> = {}) {
  return createSupabaseClientMock({
    sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
    sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
    // 1ra llamada: la jornada del dia (vacia); 2da: el insert.
    sgrh_marcas_asistencia: [
      { data: [], error: null },
      { data: null, error: null },
    ],
    ...overrides,
  })
}

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  clienteActual = client
  return client
}

/** El builder del INSERT: la ultima llamada sobre la tabla de marcas. */
function insertedMark(client: ClientMock) {
  const builder = client.from.mock.results.findLast(
    (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
  )!.value
  return (builder.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
}

describe('registerKioskMark (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ausenciasAdmin = { data: [], error: null }
    vi.stubEnv('FACE_TICKET_SECRET', TICKET_SECRET)
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 999, empresa_id: 1, sucursal_ids: [100] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await registerKioskMark({
      ...(await validInput()),
      tipo: 'ALMUERZO' as never,
    })

    expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.', definitivo: true })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  describe('solo Face ID', () => {
    it('registra la marca como FACIAL con un ticket valido del mismo empleado', async () => {
      const client = useClient(clientConTurno())

      const result = await registerKioskMark(await validInput())

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client)).toEqual(
        expect.objectContaining({
          mar_historial_laboral_id: 1,
          mar_sucursal_id: 100,
          mar_tipo: 'entrada',
          mar_metodo_verificacion: 'FACIAL',
          mar_registrado_por_id: 999,
          mar_observacion: null,
        })
      )
      expect(revalidatePath).toHaveBeenCalledWith('/attendance')
    })

    it('rechaza sin ticket: ya no hay PIN ni marca sin rostro', async () => {
      const result = await registerKioskMark({ ...(await validInput()), ticketFacial: '' })

      expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.', definitivo: true })
    })

    it('rechaza un ticket de OTRO empleado', async () => {
      const client = useClient(clientConTurno())

      const result = await registerKioskMark(
        await validInput({ ticketFacial: await signFaceTicket(99, TICKET_SECRET) })
      )

      expect(result).toEqual({
        ok: false,
        error: 'No se pudo verificar tu rostro. Avisa al encargado para que registre tu marca.',
        definitivo: true,
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
    })

    it('rechaza un ticket vencido', async () => {
      useClient(clientConTurno())

      const vencido = await signFaceTicket(10, TICKET_SECRET, Date.now() - 10 * 60 * 1000)
      const result = await registerKioskMark(await validInput({ ticketFacial: vencido }))

      expect(result.ok).toBe(false)
    })

    it('rechaza un ticket falsificado', async () => {
      useClient(clientConTurno())

      const result = await registerKioskMark(
        await validInput({ ticketFacial: '10.99999999999999.firma-falsa' })
      )

      expect(result.ok).toBe(false)
    })

    it('sin el secreto configurado no marca, y no lo trata como definitivo', async () => {
      vi.stubEnv('FACE_TICKET_SECRET', '')
      useClient(clientConTurno())

      const result = await registerKioskMark(await validInput())

      expect(result).toEqual({
        ok: false,
        error: 'El reconocimiento facial no esta configurado en el servidor.',
      })
    })
  })

  describe('turno del dia', () => {
    it('rechaza de forma definitiva a quien no tiene turno hoy en esta sucursal', async () => {
      const client = useClient(
        createSupabaseClientMock({ sgrh_programacion_semanal: { data: [], error: null } })
      )

      const result = await registerKioskMark(await validInput())

      expect(result).toEqual({
        ok: false,
        error: 'No tienes turno asignado en esta sucursal para esta fecha.',
        definitivo: true,
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
    })

    it('un dia libre no habilita a marcar aunque tenga fila de programacion', async () => {
      const client = useClient(
        createSupabaseClientMock({
          sgrh_programacion_semanal: {
            data: [{ ...ASSIGNMENT, prg_es_dia_libre: true }],
            error: null,
          },
        })
      )

      const result = await registerKioskMark(await validInput())

      expect(result.ok).toBe(false)
      expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
    })

    it('guarda la marca en la sucursal DEL DIA cuando hay traslado', async () => {
      const client = useClient(
        clientConTurno({
          sgrh_programacion_semanal: {
            data: [{ ...ASSIGNMENT, prg_sucursal_id: 200 }],
            error: null,
          },
        })
      )

      expect(await registerKioskMark(await validInput())).toEqual({ ok: true })
      expect(insertedMark(client)).toEqual(expect.objectContaining({ mar_sucursal_id: 200 }))
    })

    it('falla si el empleado no tiene un contrato activo', async () => {
      useClient(clientConTurno({ sgrh_historial_laboral: { data: null, error: null } }))

      expect(await registerKioskMark(await validInput())).toEqual({
        ok: false,
        error: 'El empleado no tiene un contrato activo.',
        definitivo: true,
      })
    })
  })

  it('rechaza de forma definitiva una salida sin haber entrado', async () => {
    // El kiosco ya esconde ese boton, pero la accion es invocable directo y la
    // cola offline manda marcas que no se pudieron validar al hacerlas.
    const client = useClient(clientConTurno())

    const result = await registerKioskMark(await validInput({ tipo: 'salida' }))

    expect(result).toEqual({
      ok: false,
      error: 'No corresponde marcar salida ahora. Puedes marcar: entrada.',
      definitivo: true,
    })
    expect(insertedMark(client)).toBeUndefined()
  })

  it('calcula la distancia a la sucursal cuando vienen coordenadas', async () => {
    const client = useClient(
      clientConTurno({
        sgrh_sucursales: { data: { suc_latitud: 9.9333, suc_longitud: -84.0833 }, error: null },
      })
    )

    const result = await registerKioskMark(
      await validInput({ latitud: 9.9333, longitud: -84.0833 })
    )

    expect(result).toEqual({ ok: true })
    expect(insertedMark(client)).toEqual(
      expect.objectContaining({ mar_distancia_geocerca_metros: 0 })
    )
  })

  describe('hora del evento (cola offline)', () => {
    it('acepta un ticket valido a la hora del evento aunque ya haya vencido al sincronizar', async () => {
      // La tablet reconocio a Ana a las 08:00 y marco sin red; esto se
      // sincroniza a las 14:00, con el ticket vencido hace horas.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T14:00:00Z')) // 08:00 en Costa Rica
      const ticket = await signFaceTicket(10, TICKET_SECRET)
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z')) // 14:00 en Costa Rica

      const client = useClient(clientConTurno())

      const result = await registerKioskMark(
        await validInput({ ticketFacial: ticket, fechaHora: '2026-08-14 08:00:30' })
      )

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_fecha_hora).toBe('2026-08-14 08:00:30')
      expect(insertedMark(client).mar_observacion).toContain('cola offline')
    })

    it('rechaza si la hora del evento no calza con cuando se verifico el rostro', async () => {
      // Ticket emitido a las 08:00: no sirve para una marca "de las 11:00".
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T14:00:00Z'))
      const ticket = await signFaceTicket(10, TICKET_SECRET)
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z'))

      useClient(clientConTurno())

      const result = await registerKioskMark(
        await validInput({ ticketFacial: ticket, fechaHora: '2026-08-14 11:00:00' })
      )

      expect(result.ok).toBe(false)
    })

    it('rechaza una hora del evento en el futuro', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z')) // 14:00 en Costa Rica
      useClient(clientConTurno())

      const result = await registerKioskMark(await validInput({ fechaHora: '2026-08-14 15:00:00' }))

      expect(result.ok).toBe(false)
    })

    it('sin hora propia usa el reloj del servidor', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z')) // 14:00 en Costa Rica
      const client = useClient(clientConTurno())

      const result = await registerKioskMark(await validInput())

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_fecha_hora).toBe('2026-08-14 14:00:00')
      expect(insertedMark(client).mar_observacion).toBeNull()
    })

    it('valida la programacion del dia del EVENTO, no la de hoy', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T14:00:00Z'))
      const ticket = await signFaceTicket(10, TICKET_SECRET)
      vi.setSystemTime(new Date('2026-08-15T20:00:00Z'))

      const client = useClient(clientConTurno())

      await registerKioskMark(
        await validInput({ ticketFacial: ticket, fechaHora: '2026-08-14 08:00:30' })
      )

      const programacionCall = client.from.mock.results.find(
        (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
      )!.value
      expect(programacionCall.eq).toHaveBeenCalledWith('prg_fecha', '2026-08-14')
    })

    it('rechaza una hora con formato invalido', async () => {
      const result = await registerKioskMark(await validInput({ fechaHora: '14/08/2026 8:00' }))

      expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.', definitivo: true })
    })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    useClient(
      clientConTurno({
        sgrh_marcas_asistencia: [
          { data: [], error: null },
          { data: null, error: { message: 'boom' } },
        ],
      })
    )

    expect(await registerKioskMark(await validInput())).toEqual({
      ok: false,
      error: 'No se pudo registrar la marca.',
    })
  })

  describe('ausencias aprobadas', () => {
    it('rechaza de forma definitiva a quien tiene una ausencia aprobada ese dia', async () => {
      ausenciasAdmin = {
        data: [{ sgrh_cat_tipos_ausencia: { tau_nombre: 'Vacaciones', tau_es_intradia: false } }],
        error: null,
      }
      const client = useClient(clientConTurno())

      const result = await registerKioskMark(await validInput())

      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining('Vacaciones'),
        definitivo: true,
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
    })

    it('si no se pudo revisar la ausencia, no marca pero reintenta (no es definitivo)', async () => {
      ausenciasAdmin = { data: null, error: { message: 'boom' } }
      useClient(clientConTurno())

      expect(await registerKioskMark(await validInput())).toEqual({
        ok: false,
        error: 'No se pudo revisar si tienes una ausencia registrada hoy.',
      })
    })
  })

  describe('la hora del almuerzo del horario', () => {
    const CON_ALMUERZO = {
      ...ASSIGNMENT,
      sgrh_cat_horarios: {
        hor_hora_entrada: '08:00:00',
        hor_hora_inicio_almuerzo: '12:00:00',
        hor_hora_fin_almuerzo: '13:00:00',
      },
    }

    function mockConAlmuerzo(marcas: unknown[]) {
      return clientConTurno({
        sgrh_programacion_semanal: { data: [CON_ALMUERZO], error: null },
        sgrh_marcas_asistencia: [
          { data: marcas, error: null },
          { data: null, error: null },
        ],
      })
    }

    const ENTRADA = {
      mar_id: 1,
      mar_tipo: 'entrada',
      mar_fecha_hora: '2026-08-14 08:00:00',
    }

    it('rechaza empezar el almuerzo fuera de su ventana', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T16:00:00Z')) // 10:00 en Costa Rica
      const client = useClient(mockConAlmuerzo([ENTRADA]))

      const result = await registerKioskMark(await validInput({ tipo: 'inicio_almuerzo' }))

      expect(result).toEqual({
        ok: false,
        error:
          'Tu almuerzo es de 12:00 a 13:00. Si necesitas tomarlo a otra hora, avisa al encargado.',
        definitivo: true,
      })
      expect(insertedMark(client)).toBeUndefined()
    })

    it('acepta empezarlo dentro de la media hora previa', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T17:40:00Z')) // 11:40 en Costa Rica
      const client = useClient(mockConAlmuerzo([ENTRADA]))

      expect(await registerKioskMark(await validInput({ tipo: 'inicio_almuerzo' }))).toEqual({
        ok: true,
      })
      expect(insertedMark(client)).toEqual(expect.objectContaining({ mar_tipo: 'inicio_almuerzo' }))
    })

    it('cerrar el almuerzo nunca se bloquea por la hora', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T21:00:00Z')) // 15:00 en Costa Rica
      const client = useClient(
        mockConAlmuerzo([
          ENTRADA,
          { mar_id: 2, mar_tipo: 'inicio_almuerzo', mar_fecha_hora: '2026-08-14 12:00:00' },
        ])
      )

      expect(await registerKioskMark(await validInput({ tipo: 'fin_almuerzo' }))).toEqual({
        ok: true,
      })
      expect(insertedMark(client)).toEqual(expect.objectContaining({ mar_tipo: 'fin_almuerzo' }))
    })
  })

  describe('la hora de salida del horario', () => {
    const CON_SALIDA = {
      ...ASSIGNMENT,
      sgrh_cat_horarios: { hor_hora_entrada: '08:00:00', hor_hora_salida: '17:00:00' },
    }

    function mockConSalida() {
      return clientConTurno({
        sgrh_programacion_semanal: { data: [CON_SALIDA], error: null },
        sgrh_marcas_asistencia: [
          {
            data: [{ mar_id: 1, mar_tipo: 'entrada', mar_fecha_hora: '2026-08-14 08:00:00' }],
            error: null,
          },
          { data: null, error: null },
        ],
      })
    }

    it('rechaza una salida marcada por error mucho antes de su hora', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T16:00:00Z')) // 10:00 en Costa Rica
      const client = useClient(mockConSalida())

      const result = await registerKioskMark(await validInput({ tipo: 'salida' }))

      expect(result).toEqual({
        ok: false,
        error: 'Tu salida es a las 17:00. Si necesitas salir antes, avisa al encargado.',
        definitivo: true,
      })
      expect(insertedMark(client)).toBeUndefined()
    })

    it('acepta la salida desde quince minutos antes', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T22:50:00Z')) // 16:50 en Costa Rica
      const client = useClient(mockConSalida())

      expect(await registerKioskMark(await validInput({ tipo: 'salida' }))).toEqual({ ok: true })
      expect(insertedMark(client)).toEqual(expect.objectContaining({ mar_tipo: 'salida' }))
    })

    it('quedarse de mas no impide cerrar la jornada', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-15T01:30:00Z')) // 19:30 en Costa Rica
      const client = useClient(mockConSalida())

      expect(await registerKioskMark(await validInput({ tipo: 'salida' }))).toEqual({ ok: true })
      expect(insertedMark(client)).toEqual(expect.objectContaining({ mar_tipo: 'salida' }))
    })
  })

  it('rechaza el receso cuando el horario del dia no lo contempla', async () => {
    const client = useClient(clientConTurno())

    const result = await registerKioskMark(await validInput({ tipo: 'inicio_receso' }))

    expect(result).toEqual({
      ok: false,
      error: 'Tu horario no tiene receso asignado. Avisa al encargado si necesitas uno.',
      definitivo: true,
    })
    expect(insertedMark(client)).toBeUndefined()
  })
})
