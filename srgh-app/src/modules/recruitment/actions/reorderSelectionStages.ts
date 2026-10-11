'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type ReorderSelectionStagesResult = { ok: true } | { ok: false; error: string }

const orderedIdsSchema = z.array(z.number().int().positive()).min(1).max(100)

/**
 * Guarda el nuevo orden de las columnas del tablero (arrastrar el encabezado).
 *
 * Recibe la lista COMPLETA de ids en el orden final y la reescribe entera:
 * `eta_orden` = posición y `eta_fase` = NULL. Limpiar la fase es lo que
 * "desengancha" el catálogo del orden histórico por fases — desde este
 * momento manda solo `eta_orden` (ver lib/stages.ts).
 *
 * La lista debe coincidir exactamente con las etapas activas: si otra persona
 * creó o borró una columna mientras tanto, se rechaza y se pide recargar, en
 * vez de guardar un orden a medias.
 *
 * Son varios UPDATE sin transacción. Si alguno fallara, quedarían órdenes
 * repetidos — un empate inofensivo (el desempate es eta_id) que el siguiente
 * reordenamiento corrige, porque siempre reescribe todas.
 */
export async function reorderSelectionStages(
  orderedIds: number[]
): Promise<ReorderSelectionStagesResult> {
  const parsed = orderedIdsSchema.safeParse(orderedIds)
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    return { ok: false, error: 'Orden de columnas inválido.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data: activas, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id')
    .eq('eta_activo', true)
    .returns<{ eta_id: number }[]>()

  if (error || !activas) {
    return { ok: false, error: 'No se pudo reordenar las columnas.' }
  }

  const activeIds = new Set(activas.map((row) => row.eta_id))
  const sameSet =
    activeIds.size === parsed.data.length && parsed.data.every((id) => activeIds.has(id))
  if (!sameSet) {
    return { ok: false, error: 'Las columnas cambiaron mientras tanto. Recargue el tablero.' }
  }

  const results = await Promise.all(
    parsed.data.map((id, index) =>
      supabase
        .from('sgrh_cat_etapas_seleccion')
        .update({ eta_orden: index + 1, eta_fase: null })
        .eq('eta_id', id)
    )
  )

  if (results.some((result) => result.error)) {
    return { ok: false, error: 'No se pudo reordenar las columnas.' }
  }

  revalidatePath('/recruitment')
  revalidatePath('/settings/recruitment/stages')
  return { ok: true }
}
