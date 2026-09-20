import { beforeEach, describe, expect, it, vi } from 'vitest'
import { justifyTardiness } from './justifyTardiness'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { revalidatePath } from 'next/cache'
import { createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

type ClientMock = ReturnType<typeof createSupabaseClientMock>

const MOTIVO = 'El sistema estaba caido y no pudo marcar, ya estaba en tienda.'

const ENTRADA = {
  data: { mar_id: 5, mar_tipo: 'entrada', sgrh_historial_laboral: { lab_empleado_id: 10 } },
  error: null,
}

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

/** El builder de la ULTIMA llamada sobre esa tabla (el update viene despues del select). */
function lastCallOn(client: ClientMock, table: string) {
  const calls = client.from.mock.results.filter((_r, i) => client.from.mock.calls[i][0] === table)
  return calls[calls.length - 1].value
}

describe('justifyTardiness (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 99, empresa_id: 1, permisos: ['ASISTENCIA_READ'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza justificar sin motivo', async () => {
    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: null })

    expect(result).toEqual({ ok: false, error: 'Escriba un motivo de al menos 10 caracteres.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('rechaza un motivo demasiado corto', async () => {
    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: 'corto' })

    expect(result.ok).toBe(false)
  })

  it('falla si no se puede determinar quien justifica', async () => {
    // El CHECK de la base exige saber QUIEN lo hizo: una justificacion
    // anonima no se puede auditar.
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1, permisos: ['ASISTENCIA_READ'] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: MOTIVO })

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo determinar el usuario que justifica.',
    })
  })

  it('falla si la marca no existe o es de otra sucursal', async () => {
    // La RLS ya la filtro: para esta accion simplemente no aparece.
    useClient(createSupabaseClientMock({ sgrh_marcas_asistencia: { data: null, error: null } }))

    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: MOTIVO })

    expect(result).toEqual({
      ok: false,
      error: 'La marca no existe o no pertenece a tus sucursales.',
    })
  })

  it('rechaza justificar una marca que no puede llegar tarde (ej. la salida)', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: {
          data: { mar_id: 5, mar_tipo: 'salida', sgrh_historial_laboral: null },
          error: null,
        },
      })
    )

    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: MOTIVO })

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede justificar la entrada o el regreso del almuerzo.',
    })
    expect(lastCallOn(client, 'sgrh_marcas_asistencia').update).not.toHaveBeenCalled()
  })

  it('guarda la justificacion con quien y cuando, y avisa al colaborador', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T20:00:00Z')) // 14:00 en Costa Rica

    const client = useClient(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: [ENTRADA, { data: null, error: null }],
        sgrh_notificaciones: { data: null, error: null },
      })
    )

    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: MOTIVO })

    vi.useRealTimers()

    expect(result).toEqual({ ok: true })
    expect(lastCallOn(client, 'sgrh_marcas_asistencia').update).toHaveBeenCalledWith({
      mar_tardia_justificada: true,
      mar_tardia_justificacion: MOTIVO,
      mar_tardia_justificada_por_id: 99,
      mar_tardia_justificada_at: '2026-09-17 14:00:00',
    })
    expect(lastCallOn(client, 'sgrh_notificaciones').insert).toHaveBeenCalledWith(
      expect.objectContaining({ ntf_empleado_id: 10, ntf_titulo: 'Tardanza justificada' })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/attendance')
  })

  it('al retirarla limpia las cuatro columnas juntas', async () => {
    // El CHECK de la migracion no admite una justificacion a medias.
    const client = useClient(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: [ENTRADA, { data: null, error: null }],
        sgrh_notificaciones: { data: null, error: null },
      })
    )

    const result = await justifyTardiness({ markId: 5, justificada: false, motivo: null })

    expect(result).toEqual({ ok: true })
    expect(lastCallOn(client, 'sgrh_marcas_asistencia').update).toHaveBeenCalledWith({
      mar_tardia_justificada: false,
      mar_tardia_justificacion: null,
      mar_tardia_justificada_por_id: null,
      mar_tardia_justificada_at: null,
    })
  })

  it('tambien avisa cuando se RETIRA: la tardanza vuelve a contar', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: [ENTRADA, { data: null, error: null }],
        sgrh_notificaciones: { data: null, error: null },
      })
    )

    await justifyTardiness({ markId: 5, justificada: false, motivo: null })

    expect(lastCallOn(client, 'sgrh_notificaciones').insert).toHaveBeenCalledWith(
      expect.objectContaining({ ntf_titulo: 'Justificacion retirada' })
    )
  })

  it('devuelve error generico si falla el guardado', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_marcas_asistencia: [ENTRADA, { data: null, error: { message: 'boom' } }],
      })
    )

    const result = await justifyTardiness({ markId: 5, justificada: true, motivo: MOTIVO })

    expect(result).toEqual({ ok: false, error: 'No se pudo guardar la justificacion.' })
  })

  it('la cuenta KIOSCO no puede justificar (tiene WRITE para marcar, pero no READ)', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: {
        usr_id: 99,
        empresa_id: 1,
        permisos: ['ASISTENCIA_KIOSCO', 'ASISTENCIA_WRITE'],
      },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)

    const result = await justifyTardiness({
      markId: 5,
      justificada: true,
      motivo: 'El sistema estaba caido esa manana',
    })

    expect(result).toEqual({ ok: false, error: 'No tienes permiso para justificar tardias.' })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
