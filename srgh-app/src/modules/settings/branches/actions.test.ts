import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createKiosk, provisionKiosk, moveKiosk } from './actions'
import { branchAdmin } from './access'
import { resendInvitation } from '@/modules/users/actions/resendInvitation'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'
vi.mock('./access', () => ({ branchAdmin: vi.fn() }))
vi.mock('@/modules/users/actions/resendInvitation', () => ({ resendInvitation: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const id = '00000000-0000-4000-8000-000000000001'
const record = {
  kio_id: id,
  kio_empresa_id: 1,
  kio_sucursal_id: 10,
  kio_email: 'kiosk@example.test',
  kio_usuario_id: null,
  kio_estado: 'pendiente',
}
function setup(
  responses: Parameters<typeof createSupabaseAdminClientMock>[0] = {},
  options?: Parameters<typeof createSupabaseAdminClientMock>[1]
) {
  const admin = createSupabaseAdminClientMock(
    {
      sgrh_kioscos: { data: record, error: null },
      sgrh_sucursales: { data: { suc_id: 10 }, error: null },
      ...responses,
    },
    options
  )
  vi.mocked(branchAdmin).mockResolvedValue({
    admin,
    empresa: 1,
    actor: 'actor',
    claims: { sub: 'actor', app_metadata: { permisos: ['USUARIOS_WRITE'] } },
  } as unknown as Awaited<ReturnType<typeof branchAdmin>>)
  return admin
}
beforeEach(() => {
  vi.clearAllMocks()
})
describe('kiosk provisioning', () => {
  it('rejects malformed input before requesting administrator access', async () => {
    expect((await createKiosk({ nombre: 'A', email: 'invalid', sucursal_id: 10 })).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })
  it('normalizes aliases and derives company and actor from authorization, not input', async () => {
    const admin = setup()
    await createKiosk({ nombre: 'Mostrador', email: ' KIOSK@Example.Test ', sucursal_id: 10 })
    expect(branchAdmin).toHaveBeenCalledWith(true)
    expect(admin.rpc).toHaveBeenCalledWith(
      'sgrh_manage_kiosk',
      expect.objectContaining({
        p_actor: 'actor',
        p_empresa: 1,
        p_data: { nombre: 'Mostrador', email: 'kiosk@example.test', sucursal_id: 10 },
      })
    )
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
  it('keeps a failed invitation recoverable without deleting the pending registry', async () => {
    const admin = setup(
      { sgrh_usuarios: { data: null, error: null } },
      { inviteResult: { data: { user: null }, error: { message: 'SMTP unavailable' } } }
    )
    const r = await provisionKiosk(id, 'invitar')
    expect(r.ok).toBe(false)
    expect(admin.rpc).not.toHaveBeenCalled()
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('does not delete a newly invited account if the subsequent link fails', async () => {
    const admin = setup(
      {
        sgrh_usuarios: [
          { data: null, error: null },
          { data: { usr_id: 2 }, error: null },
        ],
      },
      {
        rpcResponses: {
          sgrh_manage_kiosk: { data: null, error: { message: 'La cuenta no pudo vincularse' } },
        },
      }
    )
    expect(await provisionKiosk(id, 'invitar')).toEqual({
      ok: false,
      error: 'La cuenta no pudo vincularse',
    })
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('kiosk@example.test')
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('recovers an orphaned invitation only after validating the existing technical account', async () => {
    const admin = setup({
      sgrh_usuarios: [
        {
          data: { usr_id: 2, usr_auth_id: null, usr_activo: true, usr_empleado_id: null },
          error: null,
        },
        { data: { usr_id: 2 }, error: null },
      ],
      sgrh_usuarios_empresa_rol: {
        data: [
          {
            uer_empresa_id: 1,
            uer_sucursal_id: 10,
            uer_activo: true,
            sgrh_cat_roles: { rol_codigo: 'KIOSCO' },
          },
        ],
        error: null,
      },
    })
    vi.mocked(resendInvitation).mockResolvedValue({ ok: true })
    expect((await provisionKiosk(id, 'invitar')).ok).toBe(true)
    expect(resendInvitation).toHaveBeenCalledWith(2)
    expect(admin.rpc).toHaveBeenCalledWith(
      'sgrh_manage_kiosk',
      expect.objectContaining({ p_action: 'vincular', p_data: { usuario_id: 2 } })
    )
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
  it('never sends an invitation for a pending account assigned to another company', async () => {
    const admin = setup({
      sgrh_usuarios: {
        data: { usr_id: 2, usr_auth_id: null, usr_activo: true, usr_empleado_id: null },
        error: null,
      },
      sgrh_usuarios_empresa_rol: {
        data: [
          {
            uer_empresa_id: 2,
            uer_sucursal_id: 10,
            uer_activo: true,
            sgrh_cat_roles: { rol_codigo: 'KIOSCO' },
          },
        ],
        error: null,
      },
    })
    expect((await provisionKiosk(id, 'invitar')).ok).toBe(false)
    expect(resendInvitation).not.toHaveBeenCalled()
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
  it('does not invite again when the Auth identity already exists', async () => {
    const admin = setup({
      sgrh_usuarios: { data: { usr_id: 2, usr_auth_id: 'existing' }, error: null },
    })
    expect(await provisionKiosk(id, 'invitar')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Completar vínculo/),
    })
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
  })
  it('does not send email or link a blocked registration', async () => {
    const admin = setup({
      sgrh_kioscos: { data: { ...record, kio_estado: 'bloqueado' }, error: null },
    })
    expect((await provisionKiosk(id, 'invitar')).ok).toBe(false)
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })
  it('scopes assignment changes to the authorized company', async () => {
    const admin = setup()
    await moveKiosk(id, 20)
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_manage_kiosk', {
      p_actor: 'actor',
      p_empresa: 1,
      p_action: 'mover',
      p_id: id,
      p_data: { sucursal_id: 20 },
    })
  })
})
