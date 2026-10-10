'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { lastStageOrder } from '@/modules/recruitment/lib/stageColumns'

export type RestoreSelectionStageResult = { ok: true } | { ok: false; error: string }

/**
 * Vuelve a poner en el tablero una etapa desactivada. Entra como la ÚLTIMA
 * columna (después se acomoda arrastrándola) y sin fase, igual que una
 * columna recién creada — ver lib/stages.ts.
 *
 * Los candidatos que seguían parados en ella dejan de verse en "Sin etapa":
 * vuelven a aparecer en su columna, sin tocar su historial.
 */
export async function restoreSelectionStage(stageId: number): Promise<RestoreSelectionStageResult> {
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const lastOrder = await lastStageOrder(supabase)

  // El filtro por eta_activo = false hace la acción idempotente: si otra
  // persona ya la restauró, no se le cambia el lugar a una columna en uso.
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({ eta_activo: true, eta_fase: null, eta_orden: lastOrder + 1 })
    .eq('eta_id', stageId)
    .eq('eta_activo', false)
    .select('eta_id')
    .returns<{ eta_id: number }[]>()

  if (error) {
    return { ok: false, error: 'No se pudo restaurar la etapa.' }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'Esa etapa ya no está desactivada. Recargue la página.' }
  }

  revalidatePath('/recruitment')
  revalidatePath('/settings/recruitment/stages')
  return { ok: true }
}
