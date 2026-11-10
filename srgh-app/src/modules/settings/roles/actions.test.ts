import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteRole, getRolesSettings, saveRole } from './actions'
import { rolesAdmin } from './access'
import { createSupabaseAdminClientMock } from '@/test/supabaseMock'

vi.mock('./access', () => ({ rolesAdmin: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ROLES = [
  // Plantillas (sin empresa): ni la activa ni la inactiva se muestran.
  {
    rol_id: 2,
    rol_codigo: 'ADMIN',
    rol_nombre: 'Administrador de Empresa',
    rol_descripcion: null,
    rol_activo: true,
    rol_empresa_id: null,
  },
  {
    rol_id: 7,
    rol_codigo: 'RECLUTADOR',
    rol_nombre: 'Reclutador',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: null,
  },
  // El del kiosco: sin empresa, inactivo, pero se lista (por su permiso).
  {
    rol_id: 13,
    rol_codigo: 'KIOSCO',
    rol_nombre: 'Kiosco',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: null,
  },
  // La copia de «Administrador» de la empresa 1.
  {
    rol_id: 1,
    rol_codigo: 'EMPRESA_1_ADMIN',
    rol_nombre: 'Administrador de Empresa',
    rol_descripcion: null,
    rol_activo: true,
    rol_empresa_id: 1,
  },
  {
    rol_id: 40,
    rol_codigo: 'EMPRESA_1_40',
    rol_nombre: 'Supervisor Infinity',
    rol_descripcion: 'Piso',
    rol_activo: true,
    rol_empresa_id: 1,
  },
  {
    rol_id: 41,
    rol_codigo: 'EMPRESA_1_41',
    rol_nombre: 'Archivado',
    rol_descripcion: null,
    rol_activo: false,
    rol_empresa_id: 1,
  },
]

type Respuesta = { data: unknown; error: unknown }

const PERMISOS_POR_ROL = [
  { rpe_rol_id: 1, sgrh_cat_permisos: { per_codigo: 'ROLES_WRITE' } },
  { rpe_rol_id: 1, sgrh_cat_permisos: { per_codigo: 'EMPLEADOS_READ' } },
  { rpe_rol_id: 2, sgrh_cat_permisos: { per_codigo: 'ROLES_WRITE' } },
  { rpe_rol_id: 13, sgrh_cat_permisos: { per_codigo: 'ASISTENCIA_KIOSCO' } },
  { rpe_rol_id: 40, sgrh_cat_permisos: { per_codigo: 'EMPLEADOS_READ' } },
]

function setup(
  rpcResponses: Record<string, Respuesta> = {},
  tablas: Record<string, Respuesta> = {}
) {
  const admin = createSupabaseAdminClientMock(
    {
      sgrh_cat_roles: { data: ROLES, error: null },
      sgrh_usuarios_empresa_rol: {
        data: [
          { uer_id: 1, uer_usuario_id: 100, uer_rol_id: 1 },
          { uer_id: 2, uer_usuario_id: 200, uer_rol_id: 40 },
          { uer_id: 3, uer_usuario_id: 200, uer_rol_id: 40 },
          { uer_id: 4, uer_usuario_id: 300, uer_rol_id: 40 },
        ],
        error: null,
      },
      sgrh_rol_permisos: { data: PERMISOS_POR_ROL, error: null },
      ...tablas,
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
  it('lista los roles vigentes de la empresa y, de los sin empresa, solo el kiosco', async () => {
    setup()
    const r = await getRolesSettings()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Sin el archivado (41) ni las plantillas (2 y 7).
    expect(r.data.propios.map((x) => x.id)).toEqual([1, 40])
    expect(r.data.sistema.map((x) => x.id)).toEqual([13])
    expect(r.data.sistema[0].asignable).toBe(false)
  })

  it('reconoce al kiosco por su permiso, no por su código', async () => {
    // Sin ASISTENCIA_KIOSCO, la fila «KIOSCO» es una plantilla más; con él,
    // la plantilla «Reclutador» sería la que se lista.
    setup(
      {},
      {
        sgrh_rol_permisos: {
          data: [
            ...PERMISOS_POR_ROL.filter((p) => p.rpe_rol_id !== 13),
            { rpe_rol_id: 7, sgrh_cat_permisos: { per_codigo: 'ASISTENCIA_KIOSCO' } },
          ],
          error: null,
        },
      }
    )
    const r = await getRolesSettings()
    if (!r.ok) throw new Error(r.error)
    expect(r.data.sistema.map((x) => x.id)).toEqual([7])
  })

  it('no filtra el detalle de la base si falla la carga de roles', async () => {
    setup({}, { sgrh_cat_roles: { data: null, error: { message: 'relation does not exist' } } })
    expect(await getRolesSettings()).toEqual({
      ok: false,
      error: 'No se pudieron cargar los roles. Reintentá en unos segundos.',
    })
  })

  it('informa si fallan los permisos', async () => {
    setup({}, { sgrh_rol_permisos: { data: null, error: { message: 'boom' } } })
    expect(await getRolesSettings()).toEqual({
      ok: false,
      error: 'No se pudieron cargar los permisos. Reintentá.',
    })
  })

  it('cuenta cuentas distintas por rol', async () => {
    setup()
    const r = await getRolesSettings()
    if (!r.ok) throw new Error(r.error)
    const sup = r.data.propios.find((x) => x.id === 40)
    if (!sup) throw new Error('falta el rol 40')
    expect(sup.usuarios).toBe(2)
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
    const r = await saveRole(null, { nombre: 'X', descripcion: '', permisos: [] })
    expect(r.ok).toBe(false)
    expect(rolesAdmin).not.toHaveBeenCalled()
  })

  it('rechaza permisos que no se asignan (el del kiosco)', async () => {
    const r = await saveRole(null, {
      nombre: 'Tablet',
      descripcion: '',
      permisos: ['ASISTENCIA_KIOSCO'],
    })
    expect(r).toEqual({ ok: false, error: 'Hay un permiso que no se puede asignar.' })
  })

  it('manda empresa y actor de la sesión, no del formulario, y ordena los permisos', async () => {
    const admin = setup({ sgrh_save_role: { data: 55, error: null } })
    const r = await saveRole(null, {
      nombre: '  Cajero  ',
      descripcion: '',
      permisos: ['EMPLEADOS_WRITE', 'EMPLEADOS_READ'],
    })
    expect(r).toEqual({ ok: true, data: 55 })
    expect(admin.rpc).toHaveBeenCalledWith('sgrh_save_role', {
      p_actor: 'actor-uuid',
      p_empresa: 1,
      p_id: null,
      p_nombre: 'Cajero',
      p_descripcion: null,
      p_permisos: ['EMPLEADOS_READ', 'EMPLEADOS_WRITE'],
    })
  })

  it('muestra el mensaje de la RPC cuando es de validación o permiso', async () => {
    setup({
      sgrh_save_role: {
        data: null,
        error: {
          code: '42501',
          message: 'No podés otorgar permisos que tu propio rol no tiene: NOMINA_READ.',
        },
      },
    })
    const r = await saveRole(1, {
      nombre: 'Admin',
      descripcion: '',
      permisos: ['NOMINA_READ'],
    })
    expect(r).toEqual({
      ok: false,
      error: 'No podés otorgar permisos que tu propio rol no tiene: NOMINA_READ.',
    })
  })

  it('no filtra errores internos de la base', async () => {
    setup({ sgrh_save_role: { data: null, error: { code: 'XX000', message: 'internal detail' } } })
    const r = await saveRole(40, { nombre: 'Rol', descripcion: '', permisos: [] })
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
