'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rolesAdmin } from './access'
import { sortPermissions } from './permissions'
import {
  roleSchema,
  type RoleInput,
  type RoleResult,
  type RoleSummary,
  type RolesSettings,
} from './types'

const idSchema = z.number().int().positive()

/** Errores de la RPC con mensaje pensado para la UI (validación y permiso). */
const MENSAJE_PROPIO = ['23514', '42501']

interface RoleRow {
  rol_id: number
  rol_codigo: string
  rol_nombre: string
  rol_descripcion: string | null
  rol_activo: boolean
  rol_empresa_id: number | null
}

function refresh() {
  revalidatePath('/settings/roles')
  // El selector de rol de Usuarios lee el mismo catálogo.
  revalidatePath('/employees')
}

/**
 * Todo lo que necesitan el listado y el editor, leído con el cliente admin
 * DESPUÉS de revalidar al actor en vivo (`rolesAdmin`). Cada consulta filtra
 * por la empresa del JWT: los roles de otra empresa no se leen.
 *
 * Se muestran los roles vigentes de la empresa y, de los que no son de
 * ninguna, solo el del kiosco (lo reconoce su permiso, no su código). El resto
 * de las filas sin empresa son plantillas para sembrar empresas nuevas: nadie
 * de esta empresa las usa y no se editan desde acá.
 */
export async function getRolesSettings(): Promise<RoleResult<RolesSettings>> {
  const { admin, empresa, usrId } = await rolesAdmin()

  const [roles, asignaciones] = await Promise.all([
    admin
      .from('sgrh_cat_roles')
      .select('rol_id, rol_codigo, rol_nombre, rol_descripcion, rol_activo, rol_empresa_id')
      .or(`rol_empresa_id.is.null,rol_empresa_id.eq.${empresa}`)
      .order('rol_nombre')
      .returns<RoleRow[]>(),
    admin
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_id, uer_usuario_id, uer_rol_id')
      .eq('uer_empresa_id', empresa)
      .eq('uer_activo', true)
      .order('uer_id'),
  ])
  if (roles.error || asignaciones.error)
    return { ok: false, error: 'No se pudieron cargar los roles. Reintentá en unos segundos.' }

  const actorRolId =
    (asignaciones.data ?? []).find((a) => a.uer_usuario_id === usrId)?.uer_rol_id ?? null
  // Los permisos se piden para todas las filas leídas: hacen falta para
  // reconocer al kiosco entre las que no son de la empresa.
  const rolIds = [
    ...new Set([...(roles.data ?? []).map((r) => r.rol_id), ...(actorRolId ? [actorRolId] : [])]),
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

  const visibles = (roles.data ?? []).filter((r) =>
    r.rol_empresa_id === null
      ? (permisosPorRol.get(r.rol_id)?.has(PERMISOS.ASISTENCIA_KIOSCO) ?? false)
      : r.rol_activo
  )

  // Cuentas distintas por rol (una cuenta con dos sucursales cuenta una vez).
  const usuariosPorRol = new Map<number, Set<number>>()
  for (const a of asignaciones.data ?? []) {
    const set = usuariosPorRol.get(a.uer_rol_id) ?? new Set<number>()
    set.add(a.uer_usuario_id)
    usuariosPorRol.set(a.uer_rol_id, set)
  }

  const toSummary = (r: RoleRow): RoleSummary => ({
    id: r.rol_id,
    nombre: r.rol_nombre,
    descripcion: r.rol_descripcion,
    sistema: r.rol_empresa_id === null,
    asignable: r.rol_activo,
    permisos: [...(permisosPorRol.get(r.rol_id) ?? [])],
    usuarios: usuariosPorRol.get(r.rol_id)?.size ?? 0,
  })

  return {
    ok: true,
    data: {
      propios: visibles.filter((r) => r.rol_empresa_id !== null).map(toSummary),
      sistema: visibles.filter((r) => r.rol_empresa_id === null).map(toSummary),
      actorRolId,
      actorPermisos: actorRolId ? [...(permisosPorRol.get(actorRolId) ?? [])] : [],
    },
  }
}

/** Crea (id null) o edita un rol de la empresa. Las reglas las decide la RPC. */
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
 * Elimina un rol de la empresa. Si tuvo cuentas en el pasado la RPC lo archiva en vez
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
