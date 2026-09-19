import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getKioskMarkOptions } from './getKioskMarkOptions'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission as requirePermission } from '@/lib/auth/require-permission'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))

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

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  clienteActual = client
  return client
}

const TURNO = {
  data: [
    {
      prg_historial_laboral_id: 1,
      prg_empleado_id: 10,
      prg_sucursal_id: 100,
      prg_es_dia_libre: false,
      prg_es_feriado: false,
      prg_hora_entrada_custom: null,
      sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
    },
  ],
  error: null,
}

function marca(mar_id: number, mar_tipo: string, hora: string) {
  return { mar_id, mar_tipo, mar_fecha_hora: `${todayInCostaRica()} ${hora}` }
}

describe('getKioskMarkOptions (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ausenciasAdmin = { data: [], error: null }
    mockRequirePermission.mockResolvedValue({
      app_metadata: { usr_id: 7, empresa_id: 1, sucursal_ids: [100] },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
  })

  it('rechaza un colaborador invalido sin consultar nada', async () => {
    expect(await getKioskMarkOptions(0)).toEqual({ ok: false, error: 'Colaborador invalido.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('sin marcas hoy solo ofrece la entrada', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: TURNO,
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    expect(await getKioskMarkOptions(10)).toEqual({ ok: true, allowed: ['entrada'] })
  })

  it('con el almuerzo abierto solo ofrece su fin', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: TURNO,
        sgrh_marcas_asistencia: {
          data: [marca(1, 'entrada', '08:00:00'), marca(2, 'inicio_almuerzo', '12:00:00')],
          error: null,
        },
      })
    )

    expect(await getKioskMarkOptions(10)).toEqual({ ok: true, allowed: ['fin_almuerzo'] })
  })

  it('sin turno hoy en esta sucursal no ofrece nada', async () => {
    useClient(createSupabaseClientMock({ sgrh_programacion_semanal: { data: [], error: null } }))

    expect(await getKioskMarkOptions(10)).toEqual({
      ok: false,
      error: 'No tienes turno asignado en esta sucursal hoy.',
    })
  })

  it('falla si el kiosco no tiene sucursal', async () => {
    mockRequirePermission.mockResolvedValue({
      app_metadata: { empresa_id: 1 },
    } as unknown as Awaited<ReturnType<typeof requirePermission>>)
    useClient(createSupabaseClientMock({}))

    expect(await getKioskMarkOptions(10)).toEqual({
      ok: false,
      error: 'Este kiosco no tiene una sucursal asignada.',
    })
  })

  it('devuelve error si no se pueden leer las marcas', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: TURNO,
        sgrh_marcas_asistencia: { data: null, error: { message: 'boom' } },
      })
    )

    expect(await getKioskMarkOptions(10)).toEqual({
      ok: false,
      error: 'No se pudieron cargar las marcas del dia.',
    })
  })

  it('con una ausencia aprobada hoy no ofrece marcas y dice por que', async () => {
    ausenciasAdmin = {
      data: [
        {
          sgrh_cat_tipos_ausencia: {
            tau_nombre: 'Incapacidad por Enfermedad',
            tau_es_intradia: false,
          },
        },
      ],
      error: null,
    }
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: TURNO,
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    const result = await getKioskMarkOptions(10)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Incapacidad por Enfermedad')
  })

  it('la lactancia (intradia) no impide marcar', async () => {
    ausenciasAdmin = {
      data: [
        { sgrh_cat_tipos_ausencia: { tau_nombre: 'Permiso de Lactancia', tau_es_intradia: true } },
      ],
      error: null,
    }
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: TURNO,
        sgrh_marcas_asistencia: { data: [], error: null },
      })
    )

    expect(await getKioskMarkOptions(10)).toEqual({ ok: true, allowed: ['entrada'] })
  })

  it('fuera de la hora del almuerzo no ofrece empezarlo', async () => {
    vi.useFakeTimers()
    // 09:00 en Costa Rica, con almuerzo programado a las 12:00.
    vi.setSystemTime(new Date(`${todayInCostaRica()}T15:00:00Z`))
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: {
          data: [
            {
              ...TURNO.data[0],
              sgrh_cat_horarios: {
                hor_hora_entrada: '08:00:00',
                hor_hora_inicio_almuerzo: '12:00:00',
                hor_hora_fin_almuerzo: '13:00:00',
              },
            },
          ],
          error: null,
        },
        sgrh_marcas_asistencia: { data: [marca(1, 'entrada', '08:00:00')], error: null },
      })
    )

    expect(await getKioskMarkOptions(10)).toEqual({
      ok: true,
      allowed: ['inicio_receso', 'salida'],
    })

    vi.useRealTimers()
  })
})
