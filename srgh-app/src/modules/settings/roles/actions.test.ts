import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customizeRoleForBranch, deleteRole, getRolesSettings, saveRole } from './actions'
import { rolesAdmin } from './access'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('./access', () => ({ rolesAdmin: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ROLES = [
  {
    rol_id: 1,
    rol_codigo: 'ADMIN',
    rol_nombre: 'Administrador de Empresa',
    rol_descripcion: null,
    rol_activo: true,
    rol_empresa_id: null,
    rol_sucursal_id: null,
  },
  {
    rol_id: 13,
    rol_codigo: 'KIOSCO',
    rol_nombre: 'Kiosco',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: null,
    rol_sucursal_id: null,
  },
  {
    rol_id: 7,
    rol_codigo: 'RECLUTADOR',
    rol_nombre: 'Reclutador',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: null,
    rol_sucursal_id: null,
  },
  {
    rol_id: 40,
    rol_codigo: 'EMPRESA_1_40',
    rol_nombre: 'Supervisor Infinity',
    rol_descripcion: 'Piso',
    rol_activo: true,
    rol_empresa_id: 1,
    rol_sucursal_id: 10,
  },
  {
    rol_id: 41,
    rol_codigo: 'EMPRESA_1_41',
    rol_nombre: 'Archivado',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: 1,
    rol_sucursal_id: null,
  },
]

function setup(rpcResponses: Record<string, { data: unknown; error: unknown }> = {}) {
  const admin = createSupabaseAdminClientMock(
    {
      sgrh_cat_roles: { data: ROLES, error: null },
      sgrh_sucursales: {
        data: [{ suc_id: 10, suc_nombre: 'Tienda Infinity', suc_activa: true }],
        error: null,
      },
      sgrh_usuarios_empresa_rol: {
        data: [
          { uer_id: 1, uer_usuario_id: 100, uer_rol_id: 1 },
          { uer_id: 2, uer_usuario_id: 200, uer_rol_id: 40 },
          { uer_id: 3, uer_usuario_id: 200, uer_rol_id: 40 },
          { uer_id: 4, uer_usuario_id: 300, uer_rol_id: 40 },
        ],
        error: null,
      },
      sgrh_rol_permisos: {
        data: [
          { rpe_rol_id: 1, sgrh_cat_permisos: { per_codigo: 'ROLES_WRITE' } },
          { rpe_rol_id: 1, sgrh_cat_permisos: { per_codigo: 'EMPLEADOS_READ' } },
          { rpe_rol_id: 40, sgrh_cat_permisos: { per_codigo: 'EMPLEADOS_READ' } },
        ],
        error: null,
      },
    },
    { rpcResponses }
  )
  vi.mocked(rolesAdmin).mockResolvedValue({
    admin,
    empresa: 1,
    actor: 'actor-uuid',
    usrId: 100,
  } as unknown as Awaited<ReturnType<typeof rolesAdmin>>)
  return admin
}

beforeEach(() => vi.clearAllMocks())

describe('getRolesSettings', () => {
  it('separa propios y del sistema, oculta archivados e inactivos salvo el kiosco', async () => {
    setup()
    const r = await getRolesSettings()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.propios.map((x) => x.id)).toEqual([40])
    expect(r.data.sistema.map((x) => x.id)).toEqual([1, 13])
    expect(r.data.sistema.find((x) => x.id === 13)?.asignable).toBe(false)
  })

  it('cuenta cuentas distintas y resuelve la sucursal del rol', async () => {
    setup()
    const r = await getRolesSettings()
    if (!r.ok) throw new Error(r.error)
    const sup = r.data.propios[0]
    expect(sup.usuarios).toBe(2)
    expect(sup.sucursalNombre).toBe('Tienda Infinity')
    expect(sup.permisos).toEqual(['EMPLEADOS_READ'])
  })

  it('expone el rol y los permisos vivos de quien edita', async () => {
    setup()
    const r = await getRolesSettings()
    if (!r.ok) throw new Error(r.error)
    expect(r.data.actorRolId).toBe(1)
    expect(r.data.actorPermisos.sort()).toEqual(['EMPLEADOS_READ', 'ROLES_WRITE'])
  })

  it('lee solo los roles del sistema y los de su empresa', async () => {
    const admin = setup()
    await getRolesSettings()
    const query = admin.from.mock.results.find(
      (_, i) => admin.from.mock.calls[i][0] === 'sgrh_cat_roles'
    )?.value
    expect(query.or).toHaveBeenCalledWith('rol_empresa_id.is.null,rol_empresa_id.eq.1')
  })
})

describe('saveRole', () => {
  it('valida antes de pedir acceso de administrador', async () => {
    const r = await saveRole(null, { nombre: 'X', descripcion: '', sucursalId: null, permisos: [] })
    expect(r.ok).toBe(false)
    expect(rolesAdmin).not.toHaveBeenCalled()
  })

  it('rechaza permisos que no se asignan (el del kiosco)', async () => {
    const r = await saveRole(null, {
      nombre: 'Tablet',
      descripcion: '',
      sucursalId: null,
      permisos: ['ASISTENCIA_KIOSCO'],
    })
    expect(r).toEqual({ ok: false, error: 'Hay un permiso que no se puede asignar.' })
  })

  it('manda empresa y actor de la sesión, no del formulario, y ordena los permisos', async () => {
    const admin = setup({ sgrh_save_role: { data: 55, error: null } })
    const r = await saveRole(null, {
      nombre: '  Cajero  ',
      descripcion: '',
      sucursalId: 10,
      permisos: ['EMPLEADOS_WRITE', 'EMPLEADOS_READ'],
    })
    expect(r).toEqual({ ok: true, data: 55 })
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_save_role', {
      p_actor: 'actor-uuid',
      p_empresa: 1,
      p_id: null,
      p_nombre: 'Cajero',
      p_descripcion: null,
      p_sucursal: 10,
      p_permisos: ['EMPLEADOS_READ', 'EMPLEADOS_WRITE'],
    })
  })

  it('muestra el mensaje de la RPC cuando es de validación o permiso', async () => {
    setup({
      sgrh_save_role: {
        data: null,
        error: {
          code: '42501',
          message: 'Los roles del sistema no se editan. Duplicalo y editá la copia.',
        },
      },
    })
    const r = await saveRole(1, {
      nombre: 'Admin',
      descripcion: '',
      sucursalId: null,
      permisos: [],
    })
    expect(r).toEqual({
      ok: false,
      error: 'Los roles del sistema no se editan. Duplicalo y editá la copia.',
    })
  })

  it('no filtra errores internos de la base', async () => {
    setup({ sgrh_save_role: { data: null, error: { code: 'XX000', message: 'internal detail' } } })
    const r = await saveRole(40, { nombre: 'Rol', descripcion: '', sucursalId: null, permisos: [] })
    expect(r).toEqual({ ok: false, error: 'No se pudo guardar el rol.' })
  })
})

describe('deleteRole', () => {
  it('rechaza ids inválidos sin tocar la base', async () => {
    expect((await deleteRole(-1)).ok).toBe(false)
    expect(rolesAdmin).not.toHaveBeenCalled()
  })

  it('informa si el rol se archivó', async () => {
    setup({ sgrh_delete_role: { data: 'archivado', error: null } })
    expect(await deleteRole(40)).toEqual({ ok: true, data: 'archivado' })
  })

  it('propaga el bloqueo por usuarios activos', async () => {
    setup({
      sgrh_delete_role: {
        data: null,
        error: {
          code: '23514',
          message: 'El rol tiene 2 usuario(s) activo(s). Asignales otro rol antes de eliminarlo.',
        },
      },
    })
    const r = await deleteRole(40)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/usuario/)
  })
})

describe('customizeRoleForBranch', () => {
  it('valida ids antes de tocar la base', async () => {
    expect((await customizeRoleForBranch(4, 0)).ok).toBe(false)
    expect(rolesAdmin).not.toHaveBeenCalled()
  })

  it('manda empresa y actor de la sesión y devuelve el resumen', async () => {
    const admin = setup({
      sgrh_customize_role_for_branch: {
        data: { id: 77, creado: true, movidos: 2, omitidos: 1 },
        error: null,
      },
    })
    const r = await customizeRoleForBranch(4, 10)
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_customize_role_for_branch', {
      p_actor: 'actor-uuid',
      p_empresa: 1,
      p_rol_base: 4,
      p_sucursal: 10,
    })
    expect(r).toEqual({ ok: true, data: { id: 77, creado: true, movidos: 2, omitidos: 1 } })
  })

  it('muestra el mensaje de validación de la RPC', async () => {
    setup({
      sgrh_customize_role_for_branch: {
        data: null,
        error: { code: '23514', message: 'Elegí una sucursal activa de tu empresa.' },
      },
    })
    expect(await customizeRoleForBranch(4, 10)).toEqual({
      ok: false,
      error: 'Elegí una sucursal activa de tu empresa.',
    })
  })
})
