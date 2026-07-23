'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { UsuarioEstado, UsuarioListItem } from '@/modules/users/types'

interface UerQueryRow {
  uer_rol_id: number
  uer_sucursal_id: number | null
  uer_activo: boolean
  sgrh_usuarios: {
    usr_id: number
    usr_email: string
    usr_activo: boolean
    usr_auth_id: string | null
    usr_empleado_id: number | null
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
    } | null
  } | null
  sgrh_cat_roles: { rol_nombre: string | null } | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

export type GetUsersResult = { ok: true; data: UsuarioListItem[] } | { ok: false; error: string }

/**
 * Usuarios de la empresa con su estado real de acceso. Los datos de negocio
 * (rol, sucursal, vínculo, flags) salen de nuestras tablas vía RLS; el "nunca
 * inició sesión" y el último acceso solo los sabe Supabase Auth
 * (last_sign_in_at — usr_ultimo_acceso no lo actualiza nadie hoy), por eso se
 * cruza con listUsers() de la API admin.
 */
export async function getUsers(): Promise<GetUsersResult> {
  const claims = await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: asignaciones, error: uerError } = await supabase
    .from('sgrh_usuarios_empresa_rol')
    .select(
      `
      uer_rol_id,
      uer_sucursal_id,
      uer_activo,
      sgrh_usuarios (
        usr_id,
        usr_email,
        usr_activo,
        usr_auth_id,
        usr_empleado_id,
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
      ),
      sgrh_cat_roles ( rol_nombre ),
      sgrh_sucursales ( suc_nombre )
    `
    )
    .eq('uer_empresa_id', empresaId)
    .returns<UerQueryRow[]>()

  if (uerError) {
    return { ok: false, error: 'No se pudieron cargar los usuarios.' }
  }

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (authError) {
    return { ok: false, error: 'No se pudo consultar el estado de acceso de los usuarios.' }
  }

  const authPorId = new Map(authData.users.map((user) => [user.id, user]))

  const data: UsuarioListItem[] = (asignaciones ?? [])
    .filter((fila) => fila.sgrh_usuarios !== null)
    .map((fila) => {
      const usuario = fila.sgrh_usuarios!
      const authUser = usuario.usr_auth_id ? authPorId.get(usuario.usr_auth_id) : undefined
      const ultimoAcceso = authUser?.last_sign_in_at ?? null

      let estado: UsuarioEstado
      if (!usuario.usr_activo || !fila.uer_activo) {
        estado = 'desactivado'
      } else if (!ultimoAcceso) {
        estado = 'pendiente'
      } else {
        estado = 'activo'
      }

      const empleado = usuario.sgrh_empleados
      const empleadoNombre = empleado
        ? [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
            .filter(Boolean)
            .join(' ')
        : null

      return {
        usr_id: usuario.usr_id,
        email: usuario.usr_email,
        empleado_id: usuario.usr_empleado_id,
        empleado_nombre: empleadoNombre,
        rol_id: fila.uer_rol_id,
        rol_nombre: fila.sgrh_cat_roles?.rol_nombre ?? '—',
        sucursal_id: fila.uer_sucursal_id,
        sucursal_nombre: fila.sgrh_sucursales?.suc_nombre ?? null,
        estado,
        ultimo_acceso: ultimoAcceso,
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email))

  return { ok: true, data }
}
