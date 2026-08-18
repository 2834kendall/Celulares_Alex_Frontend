'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeletePuestoResult = { ok: true } | { ok: false; error: string }

export async function deletePuesto(id: number): Promise<DeletePuestoResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.from('sgrh_cat_puestos').delete().eq('pue_id', id)

  if (error) {
    return {
      ok: false,
      error:
        'No se pudo eliminar el puesto. Verifique que no este en uso por algun empleado o postulacion.',
    }
  }

  revalidatePath('/settings')
  return { ok: true }
}
