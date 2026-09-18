import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerKioskMark } from './registerKioskMark'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { signFaceTicket } from '@/modules/attendance/lib/face/faceTicket'
import type { KioskMarkInput } from '@/modules/attendance/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

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

const validInput: KioskMarkInput = {
  employeeId: 10,
  tipo: 'entrada',
  latitud: null,
  longitud: null,
  pin: null,
  dispositivoId: null,
}

describe('registerKioskMark (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 999, empresa_id: 1, sucursal_ids: [100] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza datos invalidos sin llamar a requirePermission', async () => {
    const result = await registerKioskMark({ ...validInput, tipo: 'ALMUERZO' as never })

    expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.', definitivo: true })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza de forma definitiva a quien no tiene turno hoy en esta sucursal', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No tienes turno asignado en esta sucursal para esta fecha.',
      definitivo: true,
    })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('un dia libre no habilita a marcar aunque tenga fila de programacion', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [{ ...ASSIGNMENT, prg_es_dia_libre: true }],
        error: null,
      },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result.ok).toBe(false)
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('guarda la marca en la sucursal DEL DIA cuando hay traslado', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [{ ...ASSIGNMENT, prg_sucursal_id: 200 }],
        error: null,
      },
      sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: true })
    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mar_sucursal_id: 200 })
    )
  })

  it('falla si el empleado no tiene un contrato activo', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
        sgrh_historial_laboral: { data: null, error: null },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'El empleado no tiene un contrato activo.',
      definitivo: true,
    })
  })

  it('rechaza un PIN incorrecto sin registrar la marca', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
      sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
      sgrh_empleados: { data: { emp_fecha_nacimiento: '1990-01-01' }, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({ ...validInput, pin: '1999' })

    expect(result).toEqual({ ok: false, error: 'PIN incorrecto.', definitivo: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_marcas_asistencia')
  })

  it('registra la marca con MANUAL y observacion automatica cuando el PIN es correcto', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
      sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
      sgrh_empleados: { data: { emp_fecha_nacimiento: '1990-01-01' }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({ ...validInput, pin: '1990' })

    expect(result).toEqual({ ok: true })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        mar_historial_laboral_id: 1,
        mar_sucursal_id: 100,
        mar_tipo: 'entrada',
        mar_metodo_verificacion: 'MANUAL',
        mar_registrado_por_id: 999,
        mar_observacion: 'Marcado con PIN de respaldo (camara no disponible).',
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('registra sin PIN (mock de camara) tambien como MANUAL y sin observacion', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
      sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: true })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_empleados')

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mar_metodo_verificacion: 'MANUAL', mar_observacion: null })
    )
  })

  it('calcula la distancia a la sucursal cuando vienen coordenadas', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
      sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
      sgrh_sucursales: { data: { suc_latitud: 9.9333, suc_longitud: -84.0833 }, error: null },
      sgrh_marcas_asistencia: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark({
      ...validInput,
      latitud: 9.9333,
      longitud: -84.0833,
    })

    expect(result).toEqual({ ok: true })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mar_distancia_geocerca_metros: 0 })
    )
  })

  describe('metodo de verificacion con ticket facial', () => {
    const TICKET_SECRET = 'secreto-tickets-test'

    beforeEach(() => {
      vi.stubEnv('FACE_TICKET_SECRET', TICKET_SECRET)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    function clientWithMark() {
      return createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
        sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
        sgrh_marcas_asistencia: { data: null, error: null },
      })
    }

    function insertedMark(client: ReturnType<typeof createSupabaseClientMock>) {
      const markBuilder = (client.from as ReturnType<typeof vi.fn>).mock.results.find(
        (_r: unknown, i: number) =>
          (client.from as ReturnType<typeof vi.fn>).mock.calls[i][0] === 'sgrh_marcas_asistencia'
      )!.value
      return (markBuilder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    }

    it('guarda FACIAL con un ticket valido del mismo empleado', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const ticket = await signFaceTicket(10, TICKET_SECRET)
      const result = await registerKioskMark({ ...validInput, ticketFacial: ticket })

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_metodo_verificacion).toBe('FACIAL')
    })

    it('degrada a MANUAL si el ticket es de OTRO empleado (no rechaza la marca)', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const ticket = await signFaceTicket(99, TICKET_SECRET)
      const result = await registerKioskMark({ ...validInput, ticketFacial: ticket })

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_metodo_verificacion).toBe('MANUAL')
    })

    it('degrada a MANUAL con un ticket expirado (marca que durmio en la cola offline)', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const ticket = await signFaceTicket(10, TICKET_SECRET, Date.now() - 10 * 60 * 1000)
      const result = await registerKioskMark({ ...validInput, ticketFacial: ticket })

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_metodo_verificacion).toBe('MANUAL')
    })

    it('degrada a MANUAL con un ticket falsificado', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const result = await registerKioskMark({
        ...validInput,
        ticketFacial: '10.99999999999999.firma-falsa',
      })

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_metodo_verificacion).toBe('MANUAL')
    })

    it('una marca con hora propia sube como MANUAL aunque traiga un ticket valido', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      const ticket = await signFaceTicket(10, TICKET_SECRET)
      const result = await registerKioskMark({
        ...validInput,
        ticketFacial: ticket,
        fechaHora: '2026-08-14 08:00:00',
      })

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_metodo_verificacion).toBe('MANUAL')
    })
  })

  describe('hora del evento (cola offline)', () => {
    function clientWithMark() {
      return createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
        sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
        sgrh_marcas_asistencia: { data: null, error: null },
      })
    }

    function insertedMark(client: ReturnType<typeof createSupabaseClientMock>) {
      const markBuilder = (client.from as ReturnType<typeof vi.fn>).mock.results.find(
        (_r: unknown, i: number) =>
          (client.from as ReturnType<typeof vi.fn>).mock.calls[i][0] === 'sgrh_marcas_asistencia'
      )!.value
      return (markBuilder.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    }

    it('guarda la hora del evento, no la de sincronizacion', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      // La tablet marco a las 08:00 sin red; esto se sincroniza a las 14:00.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z')) // 14:00 en Costa Rica

      const result = await registerKioskMark({
        ...validInput,
        fechaHora: '2026-08-14 08:00:00',
      })

      vi.useRealTimers()

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_fecha_hora).toBe('2026-08-14 08:00:00')
      expect(insertedMark(client).mar_observacion).toContain('cola offline')
    })

    it('sin hora propia usa el reloj del servidor, como siempre', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-14T20:00:00Z')) // 14:00 en Costa Rica

      const result = await registerKioskMark(validInput)

      vi.useRealTimers()

      expect(result).toEqual({ ok: true })
      expect(insertedMark(client).mar_fecha_hora).toBe('2026-08-14 14:00:00')
      expect(insertedMark(client).mar_observacion).toBeNull()
    })

    it('valida la programacion del dia del EVENTO, no la de hoy', async () => {
      const client = clientWithMark()
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      // La marca se hizo el 14 y se sincroniza el 15: si se comprobara
      // contra la programacion de hoy, se rechazaria por una razon que no
      // existia cuando la persona marco.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-15T20:00:00Z'))

      await registerKioskMark({ ...validInput, fechaHora: '2026-08-14 08:00:00' })

      vi.useRealTimers()

      const programacionCall = client.from.mock.results.find(
        (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
      )!.value
      expect(programacionCall.eq).toHaveBeenCalledWith('prg_fecha', '2026-08-14')
    })

    it('rechaza una hora con formato invalido', async () => {
      const result = await registerKioskMark({
        ...validInput,
        fechaHora: '14/08/2026 8:00',
      })

      expect(result).toEqual({ ok: false, error: 'Datos de marca invalidos.', definitivo: true })
    })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [ASSIGNMENT], error: null },
        sgrh_historial_laboral: { data: { lab_id: 1 }, error: null },
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await registerKioskMark(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo registrar la marca.' })
  })
})
