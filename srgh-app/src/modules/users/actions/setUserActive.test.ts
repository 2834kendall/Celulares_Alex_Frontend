import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { setUserActive } from './setUserActive'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockCreateAdminClient = vi.mocked(createAdminClient)
const mockRequirePermission = vi.mocked(requirePermission)
const mockRevalidatePath = vi.mocked(revalidatePath)

const CLAIMS = { app_metadata: { empresa_id: 1 } } as unknown as Awaited<
  ReturnType<typeof requirePermission>
>

const UER_OK = { data: [{ uer_id: 55 }], error: null }
const UER_NONE = { data: [], error: null }
const OK = { data: null, error: null }
const USUARIO_OK = { data: { usr_auth_id: 'auth-ana' }, error: null }

function mockAdmin(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0],
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(
    { sgrh_kioscos: { data: null, error: null }, ...responses },
    options
  )
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

describe('setUserActive (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza ids inválidos sin tocar permisos', async () => {
    const result = await setUserActive(0, false)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige USUARIOS_WRITE', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
      sgrh_usuarios: USUARIO_OK,
    })

    await setUserActive(7, false)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('rechaza usuarios sin asignación en la empresa del JWT (cross-tenant)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: { data: null, error: null },
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('desactivar en una sola empresa banea en Auth, apaga flags y revoca sesiones', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-ana', {
      ban_duration: '876000h',
    })

    const usrUpdateBuilder = admin.from.mock.results
      .filter((_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios')
      .at(-1)!.value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_activo: false })

    const uerUpdateBuilder = admin.from.mock.results
      .filter((_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios_empresa_rol')
      .at(-1)!.value
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_activo: false })
    expect(uerUpdateBuilder.in).toHaveBeenCalledWith('uer_id', [55])

    expect(admin.rpc).toHaveBeenCalledWith('sgrh_revoke_user_sessions', { p_auth: 'auth-ana' })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('desactivar usuario multi-empresa preserva Auth y usr_activo, apaga uer_activo y revoca sesiones', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, { data: [{ uer_id: 99 }], error: null }, OK],
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()

    const usrCalls = admin.from.mock.results.filter(
      (_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios'
    )
    expect(usrCalls).toHaveLength(1)
    expect(usrCalls[0].value.update).not.toHaveBeenCalled()

    const uerUpdateBuilder = admin.from.mock.results
      .filter((_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios_empresa_rol')
      .at(-1)!.value
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_activo: false })
    expect(uerUpdateBuilder.in).toHaveBeenCalledWith('uer_id', [55])

    expect(admin.rpc).toHaveBeenCalledWith('sgrh_revoke_user_sessions', { p_auth: 'auth-ana' })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('si sgrh_revoke_user_sessions falla con flags ya persistidos, revalida /employees y retorna error', async () => {
    mockAdmin(
      {
        sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
        sgrh_usuarios: USUARIO_OK,
      },
      {
        rpcResponses: {
          sgrh_revoke_user_sessions: { data: null, error: { message: 'rpc fail' } },
        },
      }
    )

    const result = await setUserActive(7, false)

    expect(result).toEqual({
      ok: false,
      error: 'No se pudieron cerrar las sesiones activas del usuario.',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('desactiva TODAS las filas uer de un usuario a cargo de varias sucursales', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [
        { data: [{ uer_id: 55 }, { uer_id: 56 }], error: null },
        UER_NONE,
        OK,
      ],
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })

    const uerUpdateBuilder = admin.from.mock.results
      .filter((_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios_empresa_rol')
      .at(-1)!.value
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_activo: false })
    expect(uerUpdateBuilder.in).toHaveBeenCalledWith('uer_id', [55, 56])
  })

  it('reactivar levanta el ban, enciende los flags y no revoca sesiones', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, true)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-ana', {
      ban_duration: 'none',
    })
    expect(admin.rpc).not.toHaveBeenCalled()

    const usrUpdateBuilder = admin.from.mock.results
      .filter((_, i) => admin.from.mock.calls[i][0] === 'sgrh_usuarios')
      .at(-1)!.value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_activo: true })
  })

  it('solo actualiza flags para un pendiente sin auth user ni llamada a revocar sesiones', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
      sgrh_usuarios: { data: { usr_auth_id: null }, error: null },
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('si el ban falla NO toca los flags', async () => {
    const admin = mockAdmin(
      {
        sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
        sgrh_usuarios: USUARIO_OK,
      },
      { updateUserResult: { data: { user: null }, error: { message: 'boom' } } }
    )

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el acceso del usuario.' })
    for (const call of admin.from.mock.results) expect(call.value.update).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('devuelve error si falla la consulta de otras empresas activas', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, { data: null, error: { message: 'db' } }],
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el estado del usuario.' })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('devuelve error si el update de flags falla', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: [UER_OK, UER_NONE, OK],
      sgrh_usuarios: [USUARIO_OK, { data: null, error: { message: 'boom' } }],
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el estado del usuario.' })
  })
})
