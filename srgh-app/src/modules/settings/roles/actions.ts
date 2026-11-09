'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { rolesAdmin } from './access'
import { sortPermissions } from './permissions'
import {
  roleSchema,
  type CustomizeResult,
  type RoleInput,
  type RoleResult,
  type RoleSummary,
  type RolesSettings,
} from './types'

const idSchema = z.number().int().positive()

/** Errores de la RPC con mensaje pensado para la UI (validación y permiso). */
const MENSAJE_PROPIO = ['23514', '42501']

/** El KIOSCO está inactivo a propósito (no se asigna desde Usuarios) pero se lista. */
const SISTEMA_VISIBLES_INACTIVOS = ['KIOSCO']

interface RoleRow {
  rol_id: number
  rol_codigo: string
  rol_nombre: string
  rol_descripcion: string | null
  rol_activo: boolean
  rol_empresa_id: number | null
  rol_sucursal_id: number | null
  rol_base_id: number | null
}

function refresh() {
  revalidatePath('/settings/roles')
  // El selector de rol de Usuarios lee el mismo catálogo.
  revalidatePath('/employees')
}

/**
 * Todo lo que necesitan el listado y el editor, leído con el cliente admin
 * DESPUÉS de revalidar al actor en vivo (`rolesAdmin`). Cada consulta filtra
 * por la empresa del JWT: los roles propios de otra empresa no se leen.
 */
export async function getRolesSettings(): Promise<RoleResult<RolesSettings>> {
  const { admin, empresa, usrId } = await rolesAdmin()

  const [roles, sucursales, asignaciones] = await Promise.all([
    admin
      .from('sgrh_cat_roles')
      .select(
        'rol_id, rol_codigo, rol_nombre, rol_descripcion, rol_activo, rol_empresa_id, rol_sucursal_id, rol_base_id'
      )
      .or(`rol_empresa_id.is.null,rol_empresa_id.eq.${empresa}`)
      .order('rol_nombre')
      .returns<RoleRow[]>(),
    admin
      .from('sgrh_sucursales')
      .select('suc_id, suc_nombre, suc_activa')
      .eq('suc_empresa_id', empresa)
      .order('suc_nombre'),
    admin
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_id, uer_usuario_id, uer_rol_id')
      .eq('uer_empresa_id', empresa)
      .eq('uer_activo', true)
      .order('uer_id'),
  ])
  if (roles.error || sucursales.error || asignaciones.error)
    return {
      ok: false,
      error:
        'No se pudieron cargar los roles. Comprobá que la migración de roles esté aplicada y reintentá.',
    }

  const visibles = (roles.data ?? []).filter((r) =>
    r.rol_empresa_id === null
      ? r.rol_activo || SISTEMA_VISIBLES_INACTIVOS.includes(r.rol_codigo)
      : r.rol_activo
  )

  const actorRolId =
    (asignaciones.data ?? []).find((a) => a.uer_usuario_id === usrId)?.uer_rol_id ?? null
  const rolIds = [
    ...new Set([...visibles.map((r) => r.rol_id), ...(actorRolId ? [actorRolId] : [])]),
  ]

  const permisos = rolIds.length
    ? await admin
        .from('sgrh_rol_permisos')
        .select('rpe_rol_id, sgrh_cat_permisos ( per_codigo )')
        .in('rpe_rol_id', rolIds)
        .returns<{ rpe_rol_id: number; sgrh_cat_permisos: { per_codigo: string } | null }[]>()
    : { data: [], error: null }
  if (permisos.error) return { ok: false, error: 'No se pudieron cargar los permisos. Reintentá.' }

  const permisosPorRol = new Map<number, Set<string>>()
  for (const row of permisos.data ?? []) {
    const code = row.sgrh_cat_permisos?.per_codigo
    if (!code) continue
    const set = permisosPorRol.get(row.rpe_rol_id) ?? new Set<string>()
    set.add(code)
    permisosPorRol.set(row.rpe_rol_id, set)
  }

  // Cuentas distintas por rol (una cuenta con dos sucursales cuenta una vez).
  const usuariosPorRol = new Map<number, Set<number>>()
  for (const a of asignaciones.data ?? []) {
    const set = usuariosPorRol.get(a.uer_rol_id) ?? new Set<number>()
    set.add(a.uer_usuario_id)
    usuariosPorRol.set(a.uer_rol_id, set)
  }

  const nombreSucursal = new Map((sucursales.data ?? []).map((s) => [s.suc_id, s.suc_nombre]))

  const nombreRol = new Map((roles.data ?? []).map((r) => [r.rol_id, r.rol_nombre]))

  const toSummary = (r: RoleRow): RoleSummary => ({
    id: r.rol_id,
    nombre: r.rol_nombre,
    descripcion: r.rol_descripcion,
    sistema: r.rol_empresa_id === null,
    asignable: r.rol_activo,
    sucursalId: r.rol_sucursal_id,
    sucursalNombre: r.rol_sucursal_id ? (nombreSucursal.get(r.rol_sucursal_id) ?? null) : null,
    baseId: r.rol_base_id,
    baseNombre: r.rol_base_id ? (nombreRol.get(r.rol_base_id) ?? null) : null,
    permisos: [...(permisosPorRol.get(r.rol_id) ?? [])],
    usuarios: usuariosPorRol.get(r.rol_id)?.size ?? 0,
  })

  return {
    ok: true,
    data: {
      propios: visibles.filter((r) => r.rol_empresa_id !== null).map(toSummary),
      sistema: visibles.filter((r) => r.rol_empresa_id === null).map(toSummary),
      sucursales: (sucursales.data ?? []).map((s) => ({
        id: s.suc_id,
        nombre: s.suc_nombre,
        activa: s.suc_activa,
      })),
      actorRolId,
      actorPermisos: actorRolId ? [...(permisosPorRol.get(actorRolId) ?? [])] : [],
    },
  }
}

/** Crea (id null) o edita un rol propio. Las reglas las decide la RPC. */
export async function saveRole(id: number | null, input: RoleInput): Promise<RoleResult<number>> {
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: 'Rol inválido.' }
  const parsed = roleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { admin, empresa, actor } = await rolesAdmin()
  const { data, error } = await admin.rpc('sgrh_save_role', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
    p_nombre: parsed.data.nombre,
    p_descripcion: parsed.data.descripcion || null,
    p_sucursal: parsed.data.sucursalId,
    p_permisos: sortPermissions(parsed.data.permisos),
  })
  if (error)
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(error.code) ? error.message : 'No se pudo guardar el rol.',
    }
  refresh()
  return { ok: true, data }
}

/**
 * Elimina un rol propio. Si tuvo cuentas en el pasado la RPC lo archiva en vez
 * de borrarlo (la FK de las asignaciones históricas lo impide); para quien
 * administra el efecto es el mismo: deja de existir para asignar.
 */
export async function deleteRole(id: number): Promise<RoleResult<'eliminado' | 'archivado'>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Rol inválido.' }
  const { admin, empresa, actor } = await rolesAdmin()
  const { data, error } = await admin.rpc('sgrh_delete_role', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
  })
  if (error)
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(error.code) ? error.message : 'No se pudo eliminar el rol.',
    }
  refresh()
  return { ok: true, data: data === 'archivado' ? 'archivado' : 'eliminado' }
}

/**
 * Crea la versión de una sucursal de un rol (del sistema o propio de toda la
 * empresa) con sus mismos permisos, y le pasa las cuentas que trabajan solo
 * en esa sucursal con el rol base. Si ya existe, devuelve su id.
 */
export async function customizeRoleForBranch(
  rolBaseId: number,
  sucursalId: number
): Promise<RoleResult<CustomizeResult>> {
  if (!idSchema.safeParse(rolBaseId).success || !idSchema.safeParse(sucursalId).success)
    return { ok: false, error: 'Elegí el rol y la sucursal.' }
  const { admin, empresa, actor } = await rolesAdmin()
  const { data, error } = await admin.rpc('sgrh_customize_role_for_branch', {
    p_actor: actor,
    p_empresa: empresa,
    p_rol_base: rolBaseId,
    p_sucursal: sucursalId,
  })
  if (error)
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(error.code)
        ? error.message
        : 'No se pudo personalizar el rol para la sucursal.',
    }
  const r = data as Partial<CustomizeResult> | null
  if (!r || typeof r.id !== 'number')
    return { ok: false, error: 'No se pudo personalizar el rol para la sucursal.' }
  refresh()
  return {
    ok: true,
    data: {
      id: r.id,
      creado: r.creado === true,
      movidos: Number(r.movidos ?? 0),
      omitidos: Number(r.omitidos ?? 0),
    },
  }
}
