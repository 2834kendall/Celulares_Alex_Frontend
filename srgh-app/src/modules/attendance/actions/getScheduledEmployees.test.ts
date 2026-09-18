import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getScheduledEmployees } from './getScheduledEmployees'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseClientMock } from '@/test/supabaseMock'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requireAnyPermission: vi.fn() }))

const mockCreateClient = vi.mocked(createClient)
const mockRequireAnyPermission = vi.mocked(requireAnyPermission)

type ClientMock = ReturnType<typeof createSupabaseClientMock>

/** Claims de una cuenta KIOSCO: adscrita a la sucursal 100. */
function claims(app_metadata: Record<string, unknown>) {
  return { app_metadata } as unknown as Awaited<ReturnType<typeof requireAnyPermission>>
}

function useClient(client: ClientMock) {
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    prg_historial_laboral_id: 1,
    prg_empleado_id: 10,
    prg_sucursal_id: 100,
    prg_es_dia_libre: false,
    prg_es_feriado: false,
    prg_hora_entrada_custom: null,
    sgrh_cat_horarios: { hor_hora_entrada: '08:00:00' },
    ...overrides,
  }
}

const ANA = {
  sgrh_empleados: {
    emp_id: 10,
    emp_nombre: 'Ana',
    emp_apellido_1: 'Perez',
    emp_apellido_2: null,
    emp_fecha_nacimiento: '1990-05-01',
  },
}

describe('getScheduledEmployees (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAnyPermission.mockResolvedValue(
      claims({ usr_id: 7, empresa_id: 1, sucursal_ids: [100] })
    )
  })

  it('acepta tanto el permiso estrecho del kiosco como EMPLEADOS_READ', async () => {
    useClient(createSupabaseClientMock({ sgrh_programacion_semanal: { data: [], error: null } }))

    await getScheduledEmployees()

    expect(mockRequireAnyPermission).toHaveBeenCalledWith([
      PERMISOS.ASISTENCIA_KIOSCO,
      PERMISOS.EMPLEADOS_READ,
    ])
  })

  it('falla si el usuario no tiene empresa_id en sus claims', async () => {
    mockRequireAnyPermission.mockResolvedValue(claims({}))

    const result = await getScheduledEmployees()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del kiosco.' })
  })

  it('falla si el kiosco no tiene sucursal asignada, sin caer a toda la empresa', async () => {
    mockRequireAnyPermission.mockResolvedValue(claims({ usr_id: 7, empresa_id: 1 }))
    const client = useClient(
      createSupabaseClientMock({ sgrh_usuarios_empresa_rol: { data: [], error: null } })
    )

    const result = await getScheduledEmployees()

    expect(result).toEqual({ ok: false, error: 'Este kiosco no tiene una sucursal asignada.' })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_programacion_semanal')
  })

  it('lista a quien tiene turno hoy en esta sucursal', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: { data: [ANA], error: null },
      })
    )

    const result = await getScheduledEmployees()

    expect(result).toEqual({
      ok: true,
      data: [{ employeeId: 10, fullName: 'Ana Perez', birthDateISO: '1990-05-01' }],
    })

    const programacionCall = client.from.mock.results.find(
      (_r, i) => client.from.mock.calls[i][0] === 'sgrh_programacion_semanal'
    )!.value
    expect(programacionCall.eq).toHaveBeenCalledWith('prg_fecha', todayInCostaRica())
    expect(programacionCall.in).toHaveBeenCalledWith('prg_sucursal_id', [100])
  })

  it('incluye a quien fue trasladado hoy a esta sucursal', async () => {
    // Su contrato es de otra tienda; lo que lo habilita es la fila del dia.
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: { data: [ANA], error: null },
      })
    )

    const result = await getScheduledEmployees()

    expect(result.ok && result.data.map((e) => e.employeeId)).toEqual([10])
  })

  it('no lista a quien hoy tiene dia libre o feriado', async () => {
    const client = useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: {
          data: [
            assignment({ prg_es_dia_libre: true }),
            assignment({ prg_empleado_id: 11, prg_historial_laboral_id: 2, prg_es_feriado: true }),
          ],
          error: null,
        },
      })
    )

    const result = await getScheduledEmployees()

    expect(result).toEqual({ ok: true, data: [] })
    expect(client.from).not.toHaveBeenCalledWith('sgrh_historial_laboral')
  })

  it('un dia sin turnos devuelve lista vacia, no un error de configuracion', async () => {
    useClient(createSupabaseClientMock({ sgrh_programacion_semanal: { data: [], error: null } }))

    expect(await getScheduledEmployees()).toEqual({ ok: true, data: [] })
  })

  it('descarta a quien ya no tiene contrato activo aunque el dia siguiera programado', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: { data: [], error: null },
      })
    )

    expect(await getScheduledEmployees()).toEqual({ ok: true, data: [] })
  })

  it('devuelve error si falla la carga de la programacion', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: null, error: { message: 'boom' } },
      })
    )

    expect(await getScheduledEmployees()).toEqual({
      ok: false,
      error: 'No se pudo cargar la programacion del dia.',
    })
  })

  it('devuelve error si falla la carga de colaboradores', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: { data: [assignment()], error: null },
        sgrh_historial_laboral: { data: null, error: { message: 'boom' } },
      })
    )

    expect(await getScheduledEmployees()).toEqual({
      ok: false,
      error: 'No se pudieron cargar los colaboradores.',
    })
  })

  it('ordena alfabeticamente y no repite a quien tiene mas de una fila', async () => {
    useClient(
      createSupabaseClientMock({
        sgrh_programacion_semanal: {
          data: [assignment(), assignment({ prg_empleado_id: 11, prg_historial_laboral_id: 2 })],
          error: null,
        },
        sgrh_historial_laboral: {
          data: [
            {
              sgrh_empleados: {
                emp_id: 11,
                emp_nombre: 'Zoe',
                emp_apellido_1: 'Ultimo',
                emp_apellido_2: null,
                emp_fecha_nacimiento: null,
              },
            },
            ANA,
            ANA,
          ],
          error: null,
        },
      })
    )

    const result = await getScheduledEmployees()

    expect(result.ok && result.data.map((e) => e.fullName)).toEqual(['Ana Perez', 'Zoe Ultimo'])
  })
})
