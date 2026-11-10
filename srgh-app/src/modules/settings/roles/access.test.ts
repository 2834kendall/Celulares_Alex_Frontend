import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rolesAdmin } from './access'
import { requirePermission } from '@/lib/auth/require-permission'
import { createAdminClient } from '@/lib/supabase/admin'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

type Claims = Awaited<ReturnType<typeof requirePermission>>

function setup(claims: object, rpc: { data: unknown; error: unknown }) {
  vi.mocked(requirePermission).mockResolvedValue(claims as unknown as Claims)
  const admin = createSupabaseAdminClientMock(
    {},
    { rpcResponses: { sgrh_assert_roles_admin: rpc } }
  )
  vi.mocked(createAdminClient).mockReturnValue(
    admin as unknown as ReturnType<typeof createAdminClient>
  )
  return admin
}

beforeEach(() => vi.clearAllMocks())

describe('rolesAdmin', () => {
  it('exige ROLES_WRITE y lo revalida en vivo con la empresa y el actor del JWT', async () => {
    const admin = setup(
      { sub: 'actor-uuid', app_metadata: { empresa_id: 7 } },
      { data: 100, error: null }
    )
    const r = await rolesAdmin()
    expect(requirePermission).toHaveBeenCalledWith(PERMISOS.ROLES_WRITE)
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_assert_roles_admin', {
      p_actor: 'actor-uuid',
      p_empresa: 7,
    })
    expect(r).toMatchObject({ empresa: 7, actor: 'actor-uuid', usrId: 100 })
  })

  it('falla cerrado si el JWT no trae empresa, sin tocar la base', async () => {
    setup({ sub: 'actor-uuid', app_metadata: {} }, { data: 100, error: null })
    await expect(rolesAdmin()).rejects.toThrow('No se pudo verificar la empresa.')
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('falla cerrado si el JWT no trae actor', async () => {
    setup({ app_metadata: { empresa_id: 7 } }, { data: 100, error: null })
    await expect(rolesAdmin()).rejects.toThrow('No se pudo verificar la empresa.')
  })

  it('un permiso ya quitado (JWT viejo) no pasa la revalidación en vivo', async () => {
    setup(
      { sub: 'actor-uuid', app_metadata: { empresa_id: 7 } },
      { data: null, error: { code: '42501', message: 'No tenés permiso para administrar roles.' } }
    )
    await expect(rolesAdmin()).rejects.toThrow('No tenés acceso a roles y permisos.')
  })
})
