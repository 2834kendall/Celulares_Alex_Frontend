'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteScheduleResult = { ok: true } | { ok: false; error: string }

export async function deleteSchedule(id: number): Promise<DeleteScheduleResult> {
  await requirePermission(PERMISOS.HORARIOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase.from('sgrh_cat_horarios').delete().eq('hor_id', id)

  if (error) {
    return { ok: false, error: 'No se pudo eliminar el horario. Verifique que no este en uso.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
