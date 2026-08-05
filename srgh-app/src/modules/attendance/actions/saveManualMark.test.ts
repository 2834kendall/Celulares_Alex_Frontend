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
      app_metadata: { usr_id: 5, empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza una justificacion demasiado corta sin llamar a requirePermission', async () => {
    const result = await saveManualMark({ ...validInput, observacion: 'corto' })

    expect(result).toEqual({ ok: false, error: 'Datos de la marca invalidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un tipo de marca que no esta en el vocabulario valido', async () => {
    const result = await saveManualMark({
      ...validInput,
      tipo: 'ALMUERZO' as ManualMarkInput['tipo'],
    })

    expect(result).toEqual({ ok: false, error: 'Datos de la marca invalidos.' })
  })

  it('devuelve error generico si supabase falla al insertar', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
      }) as unknown as Awaited<ReturnType<typeof createClient>>
    )

    const result = await saveManualMark(validInput)

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la marca.' })
  })

  it('crea una marca nueva (markId null), notifica al empleado y revalida la ruta', async () => {
    const client = createSupabaseClientMock({
      sgrh_marcas_asistencia: { data: null, error: null },
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
      sgrh_marcas_asistencia: { data: null, error: null },
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
})
