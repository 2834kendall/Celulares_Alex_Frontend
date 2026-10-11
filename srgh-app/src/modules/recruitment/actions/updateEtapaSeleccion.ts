'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { duplicateStageNameError } from '@/modules/recruitment/lib/stageColumns'
import { stageColumnSchema, type StageColumnInput } from '@/modules/recruitment/types'

export type UpdateEtapaSeleccionResult = { ok: true } | { ok: false; error: string }

/**
 * Renombra una columna del tablero o le cambia el color. El orden no se toca
 * acá: se cambia arrastrando el encabezado (reorderSelectionStages).
 */
export async function updateEtapaSeleccion(
  etapaId: number,
  input: StageColumnInput
): Promise<UpdateEtapaSeleccionResult> {
  if (!Number.isInteger(etapaId) || etapaId <= 0) {
    return { ok: false, error: 'Columna no encontrada.' }
  }

  const parsed = stageColumnSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la columna inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({ eta_nombre: parsed.data.nombre, eta_color: parsed.data.color })
    .eq('eta_id', etapaId)

  if (error?.code === '23505') {
    return { ok: false, error: await duplicateStageNameError(supabase, parsed.data.nombre) }
  }
  if (error) {
    return { ok: false, error: 'No se pudo actualizar la columna.' }
  }

  revalidatePath('/recruitment')
  revalidatePath('/settings/recruitment/stages')
  return { ok: true }
}
