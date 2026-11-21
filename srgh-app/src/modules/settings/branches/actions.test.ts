import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createKiosk, moveKiosk, setKioskLogin, setKioskPassword } from './actions'
import { branchAdmin } from './access'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'
vi.mock('./access', () => ({ branchAdmin: vi.fn() }))
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
const password = 'Kiosco#Seguro1'
const created = { rpcResponses: { sgrh_manage_kiosk: { data: id, error: null } } }
function rpcActions(admin: ReturnType<typeof setup>) {
  return admin.rpc.mock.calls.map(
    (call) => (call as unknown as [string, { p_action: string }])[1].p_action
  )
}
describe('kiosk registration (SGRH-111)', () => {
  it('rejects a malformed username or weak password before requesting administrator access', async () => {
    const base = { nombre: 'Mostrador', sucursal_id: 10 }
    expect((await createKiosk({ ...base, login: 'caja 1', password })).ok).toBe(false)
    expect((await createKiosk({ ...base, login: 'caja1', password: 'corta' })).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })
  it('creates a confirmed account with an internal address and never sends email', async () => {
    const admin = setup({ sgrh_usuarios: { data: { usr_id: 2 }, error: null } }, created)
    const r = await createKiosk({
      nombre: 'Mostrador',
      login: ' Centro-Caja1 ',
      password,
      sucursal_id: 10,
    })
    expect(r).toEqual({ ok: true, data: { id, accessError: undefined } })
    expect(branchAdmin).toHaveBeenCalledWith(true)
    const [, args] = admin.rpc.mock.calls[0] as unknown as [
      string,
      { p_actor: string; p_empresa: number; p_data: { login: string; email: string } },
    ]
    expect(args).toMatchObject({
      p_actor: 'actor',
      p_empresa: 1,
      p_data: { login: 'centro-caja1' },
    })
    expect(args.p_data.email).toMatch(/^kiosk-[0-9a-f-]{36}@kiosk\.sgrh\.internal$/)
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: args.p_data.email,
      password,
      email_confirm: true,
    })
    expect(rpcActions(admin)).toEqual(['crear', 'vincular'])
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })
  it('keeps the registration and reports the error when the account cannot be created', async () => {
    const admin = setup(
      {},
      {
        ...created,
        createUserResult: {
          data: { user: null },
          error: { code: 'email_address_invalid', message: 'invalid' },
        },
      }
    )
    const r = await createKiosk({ nombre: 'Mostrador', login: 'caja1', password, sucursal_id: 10 })
    expect(r).toEqual({
      ok: true,
      data: { id, accessError: expect.stringMatching(/KIOSK_EMAIL_DOMAIN/) },
    })
    expect(rpcActions(admin)).toEqual(['crear'])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
  it('gives a pre-SGRH-111 pending kiosk its existing account: links it first, then sets the password', async () => {
    const admin = setup(
      {
        sgrh_usuarios: [
          { data: { usr_id: 2 }, error: null },
          { data: { usr_auth_id: 'auth-2' }, error: null },
        ],
      },
      {
        createUserResult: {
          data: { user: null },
          error: { code: 'email_exists', message: 'already registered' },
        },
      }
    )
    expect(await setKioskPassword(id, password)).toEqual({ ok: true, data: undefined })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'kiosk@example.test' })
    )
    expect(rpcActions(admin)).toEqual(['vincular', 'clave'])
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-2', { password })
  })
  it('does not change the password of an existing account the link rejects', async () => {
    const admin = setup(
      { sgrh_usuarios: { data: { usr_id: 2 }, error: null } },
      {
        rpcResponses: {
          sgrh_manage_kiosk: { data: null, error: { message: 'La cuenta ya tiene otro rol' } },
        },
        createUserResult: {
          data: { user: null },
          error: { code: 'email_exists', message: 'already registered' },
        },
      }
    )
    const r = await setKioskPassword(id, password)
    expect(r).toEqual({ ok: false, error: 'La cuenta ya tiene otro rol' })
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })
})
describe('kiosk password and username', () => {
  const linked = {
    sgrh_kioscos: { data: { ...record, kio_usuario_id: 2, kio_estado: 'activo' }, error: null },
    sgrh_usuarios: { data: { usr_auth_id: 'auth-2' }, error: null },
  }
  it('changes the password of a linked kiosk and signs out its devices', async () => {
    const admin = setup(linked)
    expect(await setKioskPassword(id, password)).toEqual({ ok: true, data: undefined })
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('auth-2', { password })
    expect(rpcActions(admin)).toEqual(['clave'])
  })
  it('reports when the password changed but the sessions could not be closed', async () => {
    setup(linked, {
      rpcResponses: { sgrh_manage_kiosk: { data: null, error: { message: 'x' } } },
    })
    expect(await setKioskPassword(id, password)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no se pudieron cerrar las sesiones/),
    })
  })
  it('maps a password the Auth policy rejects', async () => {
    setup(linked, {
      updateUserResult: { data: { user: null }, error: { code: 'weak_password' } },
    })
    expect(await setKioskPassword(id, password)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/política de seguridad/),
    })
  })
  it('rejects a weak password before requesting administrator access', async () => {
    expect((await setKioskPassword(id, 'corta')).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })
  it('does not touch the account of a blocked kiosk', async () => {
    const admin = setup({
      sgrh_kioscos: { data: { ...record, kio_estado: 'bloqueado' }, error: null },
    })
    expect((await setKioskPassword(id, password)).ok).toBe(false)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })
  it('does not create an account for a kiosk of an inactive branch', async () => {
    const admin = setup({ sgrh_sucursales: { data: null, error: null } })
    expect(await setKioskPassword(id, password)).toEqual({
      ok: false,
      error: 'La sucursal no está activa.',
    })
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })
  it('changes the username in lowercase', async () => {
    const admin = setup()
    expect(await setKioskLogin(id, ' Norte.1 ')).toEqual({ ok: true, data: undefined })
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_manage_kiosk', {
      p_actor: 'actor',
      p_empresa: 1,
      p_action: 'usuario',
      p_id: id,
      p_data: { login: 'norte.1' },
    })
  })
  it('rejects an invalid username before requesting administrator access', async () => {
    expect((await setKioskLogin(id, 'a')).ok).toBe(false)
    expect(branchAdmin).not.toHaveBeenCalled()
  })
})
describe('kiosk assignment', () => {
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
