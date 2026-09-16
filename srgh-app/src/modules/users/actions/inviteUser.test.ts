import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inviteUser } from './inviteUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock, createSupabaseClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockCreateClient = vi.mocked(createClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

// Invitación con empleado vinculado (flujo del onboarding y del banner).
const USUARIO = { email: 'ana@empresa.com', rol_id: 4, sucursal_ids: [2], empleado_id: 10 }

// La validación de sucursales corre antes de invitar; la mayoría de tests
// necesita este mock para llegar a los pasos posteriores.
const SUCURSAL_OK = { data: [{ suc_id: 2 }], error: null }
const OK = { data: null, error: null }

// sgrh_usuarios se consulta dos veces cuando viene empleado: chequeo de
// vínculo duplicado (null = libre) y update de vinculación tras invitar.
const USUARIOS_OK = [
  { data: null, error: null },
  { data: { usr_id: 7 }, error: null },
]

// Sin asignación previa: syncUserSucursales lee, no encuentra nada, e inserta.
const UER_SIN_ASIGNACION_PREVIA = { data: [], error: null }

function mockAdmin(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0],
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(responses, options)
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

function mockSession(responses: Parameters<typeof createSupabaseClientMock>[0]) {
  const client = createSupabaseClientMock(responses)
  mockCreateClient.mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return client
}

function llamadasA(admin: ReturnType<typeof mockAdmin>, tabla: string) {
  return admin.from.mock.calls
    .map((call, i) => (call[0] === tabla ? admin.from.mock.results[i].value : null))
    .filter((v): v is NonNullable<typeof v> => v !== null)
}

describe('inviteUser (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
    mockSession({ sgrh_empleados: { data: { emp_id: 10 }, error: null } })
  })

  it('rechaza input inválido antes de tocar permisos o DB', async () => {
    const result = await inviteUser({ ...USUARIO, email: 'no-es-email' })

    expect(result).toEqual({ ok: false, error: 'Datos del usuario inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it('exige USUARIOS_WRITE', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [UER_SIN_ASIGNACION_PREVIA, OK],
    })

    await inviteUser(USUARIO)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('rechaza una sucursal de otra empresa SIN enviar la invitación', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: { data: [], error: null },
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rechaza un empleado que RLS no deja ver (otra empresa) SIN invitar', async () => {
    mockSession({ sgrh_empleados: { data: null, error: null } })
    const admin = mockAdmin({ sgrh_sucursales: SUCURSAL_OK })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'El empleado seleccionado no es válido para tu empresa.',
    })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('rechaza un empleado que ya tiene usuario vinculado SIN invitar', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 99 }, error: null },
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({ ok: false, error: 'Ese empleado ya tiene un usuario en el sistema.' })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('omite las validaciones de sucursal y empleado cuando no vienen', async () => {
    const admin = mockAdmin({
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: [UER_SIN_ASIGNACION_PREVIA, OK],
    })

    const result = await inviteUser({ email: 'ana@empresa.com', rol_id: 4 })

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.from).not.toHaveBeenCalledWith('sgrh_sucursales')
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('normaliza el email a minúsculas para invitar y vincular', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [UER_SIN_ASIGNACION_PREVIA, OK],
    })

    const result = await inviteUser({ ...USUARIO, email: ' Ana@Empresa.COM ' })

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')
  })

  it('mapea el error de correo ya registrado', async () => {
    mockAdmin(
      { sgrh_sucursales: SUCURSAL_OK, sgrh_usuarios: { data: null, error: null } },
      {
        inviteResult: {
          data: { user: null },
          error: { code: 'email_exists', message: 'already registered' },
        },
      }
    )

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({ ok: false, error: 'Ese correo ya tiene un usuario en el sistema.' })
  })

  it('devuelve error generico si la invitación falla', async () => {
    mockAdmin(
      { sgrh_sucursales: SUCURSAL_OK, sgrh_usuarios: { data: null, error: null } },
      { inviteResult: { data: { user: null }, error: { code: 'other', message: 'boom' } } }
    )

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({ ok: false, error: 'No se pudo enviar la invitación.' })
  })

  it('avisa si no se pudo vincular el usuario al empleado', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: [
        { data: null, error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La invitación se envió, pero no se pudo vincular el usuario al empleado.',
    })
  })

  it('avisa si no se pudo asignar el rol', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [
        { data: [], error: null },
        { data: null, error: { message: 'boom' } },
      ],
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La invitación se envió, pero no se pudo asignar el rol al usuario.',
    })
  })

  it('invita, vincula empleado y asigna rol en éxito', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [UER_SIN_ASIGNACION_PREVIA, OK],
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')

    const linkBuilder = llamadasA(admin, 'sgrh_usuarios')[1]
    expect(linkBuilder.update).toHaveBeenCalledWith({ usr_empleado_id: 10, usr_activo: true })

    // uer: lectura (sin filas previas) + insert de la sucursal 2.
    const uerInsertBuilder = llamadasA(admin, 'sgrh_usuarios_empresa_rol')[1]
    expect(uerInsertBuilder.insert).toHaveBeenCalledWith([
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 2, uer_activo: true },
    ])
  })

  it('invita con varias sucursales: inserta una fila uer por cada una', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: { data: [{ suc_id: 2 }, { suc_id: 3 }], error: null },
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [UER_SIN_ASIGNACION_PREVIA, OK],
    })

    const result = await inviteUser({ ...USUARIO, sucursal_ids: [2, 3] })

    expect(result).toEqual({ ok: true, usrId: 7 })

    const uerInsertBuilder = llamadasA(admin, 'sgrh_usuarios_empresa_rol')[1]
    expect(uerInsertBuilder.insert).toHaveBeenCalledWith([
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 2, uer_activo: true },
      { uer_usuario_id: 7, uer_empresa_id: 1, uer_rol_id: 4, uer_sucursal_id: 3, uer_activo: true },
    ])
  })

  it('actualiza la asignación existente en vez de insertar una segunda fila uer', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: USUARIOS_OK,
      sgrh_usuarios_empresa_rol: [{ data: [{ uer_id: 55, uer_sucursal_id: 2 }], error: null }, OK],
    })

    const result = await inviteUser(USUARIO)

    expect(result).toEqual({ ok: true, usrId: 7 })

    const uerUpdateBuilder = llamadasA(admin, 'sgrh_usuarios_empresa_rol')[1]
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_rol_id: 4 })
    expect(uerUpdateBuilder.in).toHaveBeenCalledWith('uer_id', [55])
    expect(uerUpdateBuilder.insert).not.toHaveBeenCalled()
  })
})
