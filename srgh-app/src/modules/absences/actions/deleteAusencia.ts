'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type DeleteAusenciaResult = { ok: true } | { ok: false; error: string }

export async function deleteAusencia(ausenciaId: number): Promise<DeleteAusenciaResult> {
  // RLS de sgrh_ausencias exige AUSENCIAS_APPROVE para eliminar.
  await requirePermission(PERMISOS.AUSENCIAS_APPROVE)

  const supabase = await createClient()
  const { error } = await supabase.from('sgrh_ausencias').delete().eq('aus_id', ausenciaId)

  if (error) {
    return { ok: false, error: 'No se pudo eliminar la ausencia.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
