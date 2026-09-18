'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { tipoTardiaSchema, type TipoTardiaInput } from '@/modules/settings/types'
import { tipoTardiaDbError } from '@/modules/settings/lib/tipoTardiaErrors'

export type UpdateTipoTardiaResult = { ok: true } | { ok: false; error: string }

/**
 * Editar un tipo reclasifica al instante TODOS los meses, tambien los ya
 * cerrados: el tipo de una tardanza se calcula al leerla, no se guarda. Es
 * lo que permite que corregir una marca u horario actualice la tardanza sola;
 * el costo es que la historia se mueve con el catalogo.
 */
export async function updateTipoTardia(
  id: number,
  input: TipoTardiaInput
): Promise<UpdateTipoTardiaResult> {
  const parsed = tipoTardiaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del tipo de tardia invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_tipos_tardia')
    .update({
      tta_nombre: parsed.data.tta_nombre,
      tta_desde_minutos: parsed.data.tta_desde_minutos,
      tta_cuenta_advertencia: parsed.data.tta_cuenta_advertencia,
      tta_color: parsed.data.tta_color,
    })
    .eq('tta_id', id)

  if (error) {
    return {
      ok: false,
      error: tipoTardiaDbError(error, parsed.data.tta_desde_minutos, 'actualizar'),
    }
  }

  revalidatePath('/settings')
  revalidatePath('/attendance')
  return { ok: true }
}
