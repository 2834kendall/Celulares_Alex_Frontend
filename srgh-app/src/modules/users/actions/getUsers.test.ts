import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getUsers } from './getUsers'
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

function uerRow(overrides: Record<string, unknown> = {}, usuario: Record<string, unknown> = {}) {
  return {
    uer_rol_id: 4,
    uer_sucursal_id: 2,
    uer_activo: true,
    sgrh_usuarios: {
      usr_id: 7,
      usr_email: 'ana@empresa.com',
      usr_activo: true,
      usr_auth_id: 'auth-ana',
      usr_empleado_id: 10,
      sgrh_empleados: { emp_nombre: 'Ana', emp_apellido_1: 'Mora', emp_apellido_2: null },
      ...usuario,
    },
    sgrh_cat_roles: { rol_nombre: 'Empleado' },
    sgrh_sucursales: { suc_nombre: 'Central' },
    ...overrides,
  }
}

function mockClients(
  uerResult: { data: unknown; error: unknown },
  listUsersResult?: { data: { users: unknown[] }; error: unknown }
) {
  const session = createSupabaseClientMock({ sgrh_usuarios_empresa_rol: uerResult })
  mockCreateClient.mockResolvedValue(session as unknown as Awaited<ReturnType<typeof createClient>>)

  const admin = createSupabaseAdminClientMock({}, { listUsersResult })
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return { session, admin }
}

describe('getUsers (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('exige USUARIOS_WRITE', async () => {
    mockClients({ data: [], error: null })

    await getUsers()

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('falla sin empresa en el JWT', async () => {
    mockRequirePermission.mockResolvedValue({ app_metadata: {} } as unknown as Awaited<
      ReturnType<typeof requirePermission>
    >)

    const result = await getUsers()

    expect(result).toEqual({ ok: false, error: 'No se pudo determinar la empresa del usuario.' })
  })

  it('devuelve error si la consulta de asignaciones falla', async () => {
    mockClients({ data: null, error: { message: 'boom' } })

    const result = await getUsers()

    expect(result).toEqual({ ok: false, error: 'No se pudieron cargar los usuarios.' })
  })

  it('devuelve error si listUsers falla', async () => {
    mockClients({ data: [uerRow()], error: null }, { data: { users: [] }, error: { message: 'x' } })

    const result = await getUsers()

    expect(result).toEqual({
      ok: false,
      error: 'No se pudo consultar el estado de acceso de los usuarios.',
    })
  })

  it('cruza nuestras tablas con Auth para calcular el estado', async () => {
    const authUsers = [
      { id: 'auth-ana', last_sign_in_at: '2026-07-01T10:00:00Z' },
      { id: 'auth-luis', last_sign_in_at: null },
      { id: 'auth-eva', last_sign_in_at: '2026-06-01T10:00:00Z' },
    ]
    const rows = [
      uerRow(),
      uerRow(
        {},
        {
          usr_id: 8,
          usr_email: 'luis@empresa.com',
          usr_auth_id: 'auth-luis',
          usr_empleado_id: null,
          sgrh_empleados: null,
        }
      ),
      uerRow(
        { uer_activo: false },
        { usr_id: 9, usr_email: 'eva@empresa.com', usr_auth_id: 'auth-eva' }
      ),
    ]
    mockClients({ data: rows, error: null }, { data: { users: authUsers }, error: null })

    const result = await getUsers()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const porEmail = new Map(result.data.map((u) => [u.email, u]))
    // Activo: flags propios en true + Auth registra un inicio de sesión.
    expect(porEmail.get('ana@empresa.com')).toMatchObject({
      estado: 'activo',
      ultimo_acceso: '2026-07-01T10:00:00Z',
      empleado_nombre: 'Ana Mora',
      rol_nombre: 'Empleado',
      sucursal_nombre: 'Central',
    })
    // Pendiente: solo Auth puede decirlo (nunca ha iniciado sesión).
    expect(porEmail.get('luis@empresa.com')).toMatchObject({
      estado: 'pendiente',
      empleado_nombre: null,
    })
    // Desactivado: sale de NUESTROS flags aunque Auth tenga accesos previos.
    expect(porEmail.get('eva@empresa.com')).toMatchObject({ estado: 'desactivado' })
  })

  it('marca pendiente al usuario sin auth user vinculado', async () => {
    mockClients(
      { data: [uerRow({}, { usr_auth_id: null })], error: null },
      { data: { users: [] }, error: null }
    )

    const result = await getUsers()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]).toMatchObject({ estado: 'pendiente', ultimo_acceso: null })
  })

  it('filtra por la empresa del JWT y ordena por email', async () => {
    const { session } = mockClients(
      {
        data: [
          uerRow({}, { usr_email: 'zoe@empresa.com' }),
          uerRow({}, { usr_id: 8, usr_email: 'ana@empresa.com' }),
        ],
        error: null,
      },
      { data: { users: [] }, error: null }
    )

    const result = await getUsers()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.map((u) => u.email)).toEqual(['ana@empresa.com', 'zoe@empresa.com'])

    const builder = session.from.mock.results[0].value
    expect(builder.eq).toHaveBeenCalledWith('uer_empresa_id', 1)
  })
})
