'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { duplicateStageNameError, lastStageOrder } from '@/modules/recruitment/lib/stageColumns'
import { stageColumnSchema, type StageColumnInput } from '@/modules/recruitment/types'

export type CreateEtapaSeleccionResult = { ok: true; id: number } | { ok: false; error: string }

/**
 * Crea una columna del tablero (una etapa del proceso). El orden no se pide:
 * la columna nueva va al final y se acomoda arrastrándola. Nace sin fase —
 * ver lib/stages.ts.
 */
export async function createEtapaSeleccion(
  input: StageColumnInput
): Promise<CreateEtapaSeleccionResult> {
  const parsed = stageColumnSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la columna inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const lastOrder = await lastStageOrder(supabase)

  const { data: etapa, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .insert({
      eta_nombre: parsed.data.nombre,
      eta_fase: null,
      eta_color: parsed.data.color,
      eta_orden: lastOrder + 1,
      eta_activo: true,
    })
    .select('eta_id')
    .single()

  if (error?.code === '23505') {
    return { ok: false, error: await duplicateStageNameError(supabase, parsed.data.nombre) }
  }
  if (error || !etapa) {
    return { ok: false, error: 'No se pudo crear la columna.' }
  }

  revalidatePath('/recruitment')
  revalidatePath('/settings/recruitment/stages')
  return { ok: true, id: etapa.eta_id }
}
