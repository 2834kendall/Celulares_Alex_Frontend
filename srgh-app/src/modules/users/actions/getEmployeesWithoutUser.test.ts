import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEmployeesWithoutUser } from './getEmployeesWithoutUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock, createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

function historialRow(empId: number, nombre: string, apellido: string) {
  return {
    lab_empleado_id: empId,
    sgrh_empleados: {
      emp_id: empId,
      emp_nombre: nombre,
      emp_apellido_1: apellido,
      emp_apellido_2: null,
      emp_email_personal: `${nombre.toLowerCase()}@mail.com`,
    },
    sgrh_cat_puestos: { pue_nombre: 'Cajera' },
  }
}

function mockClients(
  historialResult: { data: unknown; error: unknown },
  vinculadosResult: { data: unknown; error: unknown } = { data: [], error: null }
) {
  const session = createSupabaseClientMock({ sgrh_historial_laboral: historialResult })
  mockCreateClient.mockResolvedValue(session as unknown as Awaited<ReturnType<typeof createClient>>)

  const admin = createSupabaseAdminClientMock({ sgrh_usuarios: vinculadosResult })
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return { session, admin }
}

describe('getEmployeesWithoutUser (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('exige USUARIOS_WRITE', async () => {
    mockClients({ data: [], error: null })

    await getEmployeesWithoutUser()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('devuelve error si la consulta de historial falla', async () => {
    mockClients({ data: null, error: { message: 'boom' } })

    const result = await getEmployeesWithoutUser()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los empleados activos.' })
  })

  it('devuelve error si la consulta de vínculos falla', async () => {
    mockClients({ data: [], error: null }, { data: null, error: { message: 'boom' } })

    const result = await getEmployeesWithoutUser()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron verificar los usuarios existentes.',
    })
  })

  it('excluye a los empleados que ya tienen usuario vinculado', async () => {
    mockClients(
      { data: [historialRow(10, 'Ana', 'Mora'), historialRow(11, 'Luis', 'Rojas')], error: null },
      { data: [{ usr_empleado_id: 10 }], error: null }
    )

    const result = await getEmployeesWithoutUser()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual([
      {
        emp_id: 11,
        nombre_completo: 'Luis Rojas',
        email_personal: 'luis@mail.com',
        puesto_nombre: 'Cajera',
      },
    ])
  })

  it('deduplica empleados con más de un historial activo y ordena por nombre', async () => {
    mockClients(
      {
        data: [
          historialRow(12, 'Zoe', 'Vega'),
          historialRow(11, 'Luis', 'Rojas'),
          historialRow(12, 'Zoe', 'Vega'),
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await getEmployeesWithoutUser()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((e) => e.nombre_completo)).toEqual(['Luis Rojas', 'Zoe Vega'])
  })

  it('consulta solo los contratos vigentes de la empresa del JWT', async () => {
    const { session } = mockClients({ data: [], error: null })

    await getEmployeesWithoutUser()

    const builder = session.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('lab_empresa_id', 1)
    expect(builder.is).toHaveBeenCalledWith('lab_fecha_fin', null)
  })
})
