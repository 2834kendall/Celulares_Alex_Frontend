'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { CODIGOS_DEL_SISTEMA, tipoAusenciaDbError } from '@/modules/absences/lib/tipoAusenciaErrors'

export type DeleteTipoAusenciaResult = { ok: true } | { ok: false; error: string }

// Si hay ausencias registradas con el tipo, la FK lo impide y se explica el motivo.
export async function deleteTipoAusencia(id: number): Promise<DeleteTipoAusenciaResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const { data: tipo } = await supabase
    .from('sgrh_cat_tipos_ausencia')
    .select('tau_codigo')
    .eq('tau_id', id)
    .maybeSingle()

  if (tipo && CODIGOS_DEL_SISTEMA[tipo.tau_codigo]) {
    return { ok: false, error: CODIGOS_DEL_SISTEMA[tipo.tau_codigo] }
  }

  const { error } = await supabase.from('sgrh_cat_tipos_ausencia').delete().eq('tau_id', id)

  if (error) {
    return { ok: false, error: tipoAusenciaDbError(error, tipo?.tau_codigo ?? '', 'eliminar') }
  }

  revalidatePath('/settings', 'layout')
  revalidatePath('/schedule')
  return { ok: true }
}
