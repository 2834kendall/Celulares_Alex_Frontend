import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveManualMark } from './saveManualMark'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import type { ManualMarkInput } from '@/modules/attendance/types'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const validInput: ManualMarkInput = {
  markId: null,
  employmentHistoryId: 1,
  employeeId: 10,
  sucursalId: 100,
  tipo: 'entrada',
  fecha: '2026-07-25',
  hora: '08:04',
  observacion: 'La tablet del kiosco no encendio esta mañana.',
}

describe('saveManualMark (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 5, empresa_id: 1, permisos: ['ASISTENCIA_READ'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza una justificacion demasiado corta sin llamar a requirePermission', async () => {
    const result = await saveManualMark({ ...validInput, observacion: 'corto' })

    expect(result).toEqual({ ok: false, error: 'Datos de la marca inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un tipo de marca que no esta en el vocabulario valido', async () => {
    const result = await saveManualMark({
      ...validInput,
      tipo: 'ALMUERZO' as ManualMarkInput['tipo'],
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la marca inválidos.' })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await saveManualMark(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la marca.' })
  })

  it('crea una marca nueva (markId null), notifica al empleado y revalida la ruta', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: { data: [], error: null },
      sgrh_marcas_asistencia: { data: [{ mar_id: 77 }], error: null },
      sgrh_notificaciones: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await saveManualMark(validInput)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('sgrh_marcas_asistencia')

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        mar_historial_laboral_id: 1,
        mar_sucursal_id: 100,
        mar_tipo: 'entrada',
        mar_fecha_hora: '2026-07-25 08:04:00',
        mar_metodo_verificacion: 'MANUAL',
        mar_registrado_por_id: 5,
        mar_observacion: validInput.observacion,
      })
    )
    expect(markBuilder.update).not.toHaveBeenCalled()

    expect(client.from).toHaveBeenCalledWith('sgrh_notificaciones')
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('corrige una marca existente (markId numerico) con update, no con insert', async () => {
    const client = createSupabaseClientMock({
      sgrh_marcas_asistencia: { data: [{ mar_id: 77 }], error: null },
      sgrh_notificaciones: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await saveManualMark({ ...validInput, markId: 77 })

    expect(result).toEqual({ ok: true })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    expect(markBuilder.update).toHaveBeenCalled()
    expect(markBuilder.eq).toHaveBeenCalledWith('mar_id', 77)
    expect(markBuilder.insert).not.toHaveBeenCalled()
  })

  it('uses the branch of the scheduled second block when adding a mark', async () => {
    const client = createSupabaseClientMock({
      sgrh_programacion_semanal: {
        data: [
          {
            prg_sucursal_id: 200,
            prg_hora_entrada_custom: '18:00',
            prg_hora_salida_custom: '23:00',
          },
          {
            prg_sucursal_id: 100,
            prg_hora_entrada_custom: '08:00',
            prg_hora_salida_custom: '12:00',
          },
        ],
        error: null,
      },
      sgrh_marcas_asistencia: { data: [{ mar_id: 77 }], error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    expect(await saveManualMark({ ...validInput, hora: '18:05' })).toEqual({ ok: true })
    const marks = client.from.mock.results[1].value
    expect(marks.insert).toHaveBeenCalledWith(expect.objectContaining({ mar_sucursal_id: 200 }))
    expect(marks.select).toHaveBeenCalledWith('mar_id')
  })

  it.each([null, 77])(
    'fails without notifications or revalidation when mark %s returns zero rows',
    async (markId) => {
      const client = createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [], error: null },
        sgrh_marcas_asistencia: { data: [], error: null },
      })
      mockCreateClient.mockResolvedValue(
        client as unknown as Awaited<ReturnType<typeof createClient>>
      )

      expect(await saveManualMark({ ...validInput, markId })).toEqual({
        ok: false,
        error: 'No se pudo guardar la marca.',
      })
      expect(client.from).not.toHaveBeenCalledWith('sgrh_notificaciones')
      expect(revalidatePath).not.toHaveBeenCalled()
    }
  )

  it('al corregir una marca no le reescribe la sucursal donde se hizo', async () => {
    const client = createSupabaseClientMock({
      sgrh_marcas_asistencia: { data: [{ mar_id: 77 }], error: null },
      sgrh_notificaciones: { data: null, error: null },
    })
    mockCreateClient.mockResolvedValue(
      client as unknown as Awaited<ReturnType<typeof createClient>>
    )

    await saveManualMark({ ...validInput, markId: 77 })

    const markBuilder = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_marcas_asistencia'
    )!.value
    // La fila de un dia con un tramo por sucursal trae la del primer tramo:
    // si viajara en el update, la marca del segundo bloque cambiaria de tienda.
    expect(markBuilder.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ mar_sucursal_id: expect.anything() })
    )
  })

  it('la cuenta KIOSCO no puede registrar marcas manuales (tiene WRITE, pero no READ)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {
        usr_id: 5,
        empresa_id: 1,
        permisos: ['ASISTENCIA_KIOSCO', 'ASISTENCIA_WRITE'],
      },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await saveManualMark(validInput)

    expect(result).toEqual({
      ok: false,
      error: 'No tenés permiso para registrar marcas manuales.',
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
