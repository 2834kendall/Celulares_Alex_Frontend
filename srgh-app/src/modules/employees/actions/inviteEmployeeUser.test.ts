import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inviteEmployeeUser } from './inviteEmployeeUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockRequirePermission = vi.mocked(requirePermission)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const USUARIO = { email: 'ana@empresa.com', rol_id: 4, sucursal_id: 2 }

// La validación de sucursal corre antes de invitar; la mayoría de tests
// necesita este mock para llegar a los pasos posteriores.
const SUCURSAL_OK = { data: { suc_id: 2 }, error: null }

function mockAdmin(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0],
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(responses, options)
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

describe('inviteEmployeeUser (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza input inválido antes de tocar permisos o DB', async () => {
    const result = await inviteEmployeeUser(10, { ...USUARIO, email: 'no-es-email' })

    expect(result).toEqual({ ok: false, error: 'Datos del usuario inválidos.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it('exige USUARIOS_WRITE', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    await inviteEmployeeUser(10, USUARIO)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('rechaza una sucursal de otra empresa SIN enviar la invitación', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: { data: null, error: null },
    })

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La sucursal seleccionada no es válida para tu empresa.',
    })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('omite la validación de sucursal cuando no viene sucursal_id', async () => {
    const admin = mockAdmin({
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    const result = await inviteEmployeeUser(10, { email: 'ana@empresa.com', rol_id: 4 })

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.from).not.toHaveBeenCalledWith('sgrh_sucursales')
  })

  it('normaliza el email a minúsculas para invitar y vincular', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    const result = await inviteEmployeeUser(10, { ...USUARIO, email: ' Ana@Empresa.COM ' })

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')

    const usuariosBuilder = admin.from.mock.results[1].value
    expect(usuariosBuilder.eq).toHaveBeenCalledWith('usr_email', 'ana@empresa.com')
  })

  it('mapea el error de correo ya registrado', async () => {
    mockAdmin(
      { sgrh_sucursales: SUCURSAL_OK },
      {
        inviteResult: {
          data: { user: null },
          error: { code: 'email_exists', message: 'already registered' },
        },
      }
    )

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({ ok: false, error: 'Ese correo ya tiene un usuario en el sistema.' })
  })

  it('devuelve error generico si la invitación falla', async () => {
    mockAdmin(
      { sgrh_sucursales: SUCURSAL_OK },
      { inviteResult: { data: { user: null }, error: { code: 'other', message: 'boom' } } }
    )

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({ ok: false, error: 'No se pudo enviar la invitación.' })
  })

  it('avisa si no se pudo vincular el usuario al empleado', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: null, error: { message: 'boom' } },
    })

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La invitación se envió, pero no se pudo vincular el usuario al empleado.',
    })
  })

  it('avisa si no se pudo asignar el rol', async () => {
    mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: { data: null, error: { message: 'boom' } },
    })

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({
      ok: false,
      error: 'La invitación se envió, pero no se pudo asignar el rol al usuario.',
    })
  })

  it('invita, vincula empleado y asigna rol en éxito', async () => {
    const admin = mockAdmin({
      sgrh_sucursales: SUCURSAL_OK,
      sgrh_usuarios: { data: { usr_id: 7 }, error: null },
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    const result = await inviteEmployeeUser(10, USUARIO)

    expect(result).toEqual({ ok: true, usrId: 7 })
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')

    const uerBuilder = admin.from.mock.results[2].value
    expect(uerBuilder.insert).toHaveBeenCalledWith({
      uer_usuario_id: 7,
      uer_empresa_id: 1,
      uer_rol_id: 4,
      uer_sucursal_id: 2,
    })
  })
})
