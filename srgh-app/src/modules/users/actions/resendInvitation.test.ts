import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { resendInvitation } from './resendInvitation'
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
const USUARIO_OK = { data: { usr_email: 'ana@empresa.com', usr_auth_id: 'auth-ana' }, error: null }
const AUTH_PENDIENTE = { data: { user: { id: 'auth-ana', last_sign_in_at: null } }, error: null }

function mockAdmin(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0],
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(responses, options)
  mockCreateAdminClient.mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>)
  return admin
}

describe('resendInvitation (server action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequirePermission.mockResolvedValue(CLAIMS)
  })

  it('rechaza ids inválidos sin tocar permisos', async () => {
    const result = await resendInvitation(0)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(mockRequirePermission).not.toHaveBeenCalled()
  })

  it('exige USUARIOS_WRITE', async () => {
    mockAdmin(
      { sgrh_usuarios_empresa_rol: UER_OK, sgrh_usuarios: USUARIO_OK },
      { getUserResult: AUTH_PENDIENTE }
    )

    await resendInvitation(7)

    expect(mockRequirePermission).toHaveBeenCalledWith(PERMISOS.USUARIOS_WRITE)
  })

  it('rechaza usuarios sin asignación en la empresa del JWT (cross-tenant)', async () => {
    const admin = mockAdmin({ sgrh_usuarios_empresa_rol: { data: null, error: null } })

    const result = await resendInvitation(7)

    expect(result).toEqual({ ok: false, error: 'Usuario no encontrado.' })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('bloquea el reenvío si el usuario YA inició sesión (no destruye identidades)', async () => {
    const admin = mockAdmin(
      { sgrh_usuarios_empresa_rol: UER_OK, sgrh_usuarios: USUARIO_OK },
      {
        getUserResult: {
          data: { user: { id: 'auth-ana', last_sign_in_at: '2026-07-01T10:00:00Z' } },
          error: null,
        },
      }
    )

    const result = await resendInvitation(7)

    expect(result).toEqual({
      ok: false,
      error: 'Solo se puede reenviar la invitación a usuarios que nunca han iniciado sesión.',
    })
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('desvincula, borra el auth user pendiente y re-invita al mismo email', async () => {
    const admin = mockAdmin(
      { sgrh_usuarios_empresa_rol: UER_OK, sgrh_usuarios: USUARIO_OK },
      { getUserResult: AUTH_PENDIENTE }
    )

    const result = await resendInvitation(7)

    expect(result).toEqual({ ok: true })

    // from(): uer (read), usuarios (read), usuarios (unlink)
    const unlinkBuilder = admin.from.mock.results[2].value
    expect(unlinkBuilder.update).toHaveBeenCalledWith({ usr_auth_id: null })
    expect(unlinkBuilder.eq).toHaveBeenCalledWith('usr_id', 7)

    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith('auth-ana')
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/employees')
  })

  it('re-invita directamente a una fila huérfana (sin auth user)', async () => {
    const admin = mockAdmin({
      sgrh_usuarios_empresa_rol: UER_OK,
      sgrh_usuarios: { data: { usr_email: 'ana@empresa.com', usr_auth_id: null }, error: null },
    })

    const result = await resendInvitation(7)

    expect(result).toEqual({ ok: true })
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled()
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('ana@empresa.com')
  })

  it('devuelve error si el borrado del auth user falla', async () => {
    const admin = mockAdmin(
      { sgrh_usuarios_empresa_rol: UER_OK, sgrh_usuarios: USUARIO_OK },
      {
        getUserResult: AUTH_PENDIENTE,
        deleteUserResult: { data: null, error: { message: 'boom' } },
      }
    )

    const result = await resendInvitation(7)

    expect(result).toEqual({ ok: false, error: 'No se pudo reenviar la invitación.' })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('devuelve error si la re-invitación falla', async () => {
    mockAdmin(
      { sgrh_usuarios_empresa_rol: UER_OK, sgrh_usuarios: USUARIO_OK },
      {
        getUserResult: AUTH_PENDIENTE,
        inviteResult: { data: { user: null }, error: { code: 'other', message: 'boom' } },
      }
    )

    const result = await resendInvitation(7)

    expect(result).toEqual({ ok: false, error: 'No se pudo reenviar la invitación.' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
