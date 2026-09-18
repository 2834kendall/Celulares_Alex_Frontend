'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteTipoTardiaResult = { ok: true } | { ok: false; error: string }

/**
 * Borra un tipo de tardia. No hay nada que lo referencie — el tipo de cada
 * tardanza se calcula al leerla —, asi que el borrado es directo; lo que se
 * vuelve a clasificar es el rango que cubria: pasa al tipo anterior, o, si
 * era el primero, deja de ser tardanza.
 *
 * Lo unico que se impide es quedarse sin tipos: una empresa sin catalogo no
 * registraria ninguna tardanza, y sin aviso.
 */
export async function deleteTipoTardia(id: number): Promise<DeleteTipoTardiaResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  // La RLS acota a la empresa del usuario: esto cuenta solo los suyos.
  const { data: tipos, error: errTipos } = await supabase
    .from('sgrh_cat_tipos_tardia')
    .select('tta_id')

  if (errTipos) {
    return { ok: false, error: 'No se pudo eliminar el tipo de tardia.' }
  }

  if ((tipos ?? []).length <= 1) {
    return {
      ok: false,
      error:
        'Tiene que quedar al menos un tipo de tardia: sin ninguno, no se registraria ninguna tardanza.',
    }
  }

  const { error } = await supabase.from('sgrh_cat_tipos_tardia').delete().eq('tta_id', id)

  if (error) {
    return { ok: false, error: 'No se pudo eliminar el tipo de tardia.' }
  }

  revalidatePath('/settings')
  revalidatePath('/attendance')
  return { ok: true }
}
