'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteShiftTypeResult = { ok: true } | { ok: false; error: string }

export async function deleteShiftType(id: number): Promise<DeleteShiftTypeResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.from('sgrh_cat_tipos_jornada').delete().eq('tjo_id', id)

  if (error) {
    return {
      ok: false,
      error:
        'No se pudo eliminar el tipo de jornada. Verifique que no este en uso por algun horario.',
    }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
