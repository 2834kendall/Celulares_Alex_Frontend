import type { createAdminClient } from '@/lib/supabase/admin'

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

export interface SyncUserSucursalesParams {
  admin: SupabaseAdminClient
  usrId: number
  empresaId: number
  rolId: number
  /** Vacio = el usuario opera a nivel empresa (equivalente al viejo sucursal_id null). */
  sucursalIds: number[]
}

/**
 * Deja las filas uer ACTIVAS de (usrId, empresaId) igual al conjunto
 * deseado: inserta las sucursales nuevas, borra las que ya no aplican y
 * actualiza el rol en las que sobreviven — para que updateUserAssignment e
 * inviteUser no dupliquen el mismo diff. `uer_sucursal_id: null` (nivel
 * empresa) se trata como una sucursal más de la lista para efectos de la
 * comparacion.
 *
 * Invariante: todas las filas activas de un mismo usuario+empresa comparten
 * rol_id (es el rol/permisos que via el hook del JWT). Por eso el rol se
 * aplica a TODAS las filas sobrevivientes, no solo a las nuevas.
 */
export async function syncUserSucursales({
  admin,
  usrId,
  empresaId,
  rolId,
  sucursalIds,
}: SyncUserSucursalesParams): Promise<{ error: string | null }> {
  const { data: existentes, error: readError } = await admin
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_id, uer_sucursal_id')
    .eq('uer_usuario_id', usrId)
    .eq('uer_empresa_id', empresaId)
    .eq('uer_activo', true)

  if (readError) {
    return { error: 'No se pudieron leer las sucursales actuales del usuario.' }
  }

  const deseadas: (number | null)[] = sucursalIds.length > 0 ? sucursalIds : [null]
  const filasExistentes = existentes ?? []
  const existentesPorSucursal = new Map(filasExistentes.map((fila) => [fila.uer_sucursal_id, fila]))

  const aInsertar = deseadas.filter((id) => !existentesPorSucursal.has(id))
  const aBorrar = filasExistentes.filter((fila) => !deseadas.includes(fila.uer_sucursal_id))
  const idsSobrevivientes = filasExistentes
    .filter((fila) => deseadas.includes(fila.uer_sucursal_id))
    .map((fila) => fila.uer_id)

  if (idsSobrevivientes.length > 0) {
    const { error } = await admin
      .from('sgrh_usuarios_empresa_rol')
      .update({ uer_rol_id: rolId })
      .in('uer_id', idsSobrevivientes)

    if (error) return { error: 'No se pudo actualizar el rol del usuario.' }
  }

  if (aBorrar.length > 0) {
    const { error } = await admin
      .from('sgrh_usuarios_empresa_rol')
      .delete()
      .in(
        'uer_id',
        aBorrar.map((fila) => fila.uer_id)
      )

    if (error) return { error: 'No se pudo actualizar las sucursales del usuario.' }
  }

  if (aInsertar.length > 0) {
    const { error } = await admin.from('sgrh_usuarios_empresa_rol').insert(
      aInsertar.map((sucursalId) => ({
        uer_usuario_id: usrId,
        uer_empresa_id: empresaId,
        uer_rol_id: rolId,
        uer_sucursal_id: sucursalId,
        uer_activo: true,
      }))
    )

    if (error) return { error: 'No se pudo asignar las sucursales al usuario.' }
  }

  return { error: null }
}
