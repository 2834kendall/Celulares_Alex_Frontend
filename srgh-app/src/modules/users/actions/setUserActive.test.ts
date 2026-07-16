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

const UER_OK = { data: { uer_id: 55 }, error: null }
const USUARIO_OK = { data: { usr_auth_id: 'auth-ana' }, error: null }

function mockAdmin(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0],
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(responses, options)
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
      sgrh_usuarios_empresa_rol: UER_OK,
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
  })

  it('desactivar banea en Auth y apaga usr_activo y uer_activo', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-ana', {
      ban_duration: '876000h',
    })

    // from(): uer (read), usuarios (read), usuarios (update), uer (update)
    const usrUpdateBuilder = admin.from.mock.results[2].value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_activo: false })

    const uerUpdateBuilder = admin.from.mock.results[3].value
    expect(uerUpdateBuilder.update).toHaveBeenCalledWith({ uer_activo: false })
    expect(uerUpdateBuilder.eq).toHaveBeenCalledWith('uer_id', 55)

    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('reactivar levanta el ban y enciende los flags', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: USUARIO_OK,
    })

    const result = await setUserActive(7, true)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-ana', {
      ban_duration: 'none',
    })

    const usrUpdateBuilder = admin.from.mock.results[2].value
    expect(usrUpdateBuilder.update).toHaveBeenCalledWith({ usr_activo: true })
  })

  it('solo actualiza flags para un pendiente sin auth user', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: { data: { usr_auth_id: null }, error: null },
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('si el ban falla NO toca los flags', async () => {
    const admin = mockAdmin(
      {
        sgrh_usuarios_empresa_rol: UER_OK,
        sgrh_usuarios: USUARIO_OK,
      },
      { updateUserResult: { data: { user: null }, error: { message: 'boom' } } }
    )

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el acceso del usuario.' })
    // Solo las dos lecturas: nunca llegó a los updates de flags.
    expect(admin.from).toHaveBeenCalledTimes(2)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('devuelve error si el update de flags falla', async () => {
    mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: [USUARIO_OK, { data: null, error: { message: 'boom' } }],
    })

    const result = await setUserActive(7, false)

    expect(result).toEqual({ ok: false, error: 'No se pudo actualizar el estado del usuario.' })
  })
})
