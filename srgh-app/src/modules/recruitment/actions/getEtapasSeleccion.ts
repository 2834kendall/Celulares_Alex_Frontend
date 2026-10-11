'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { fetchStageColumns } from '@/modules/recruitment/lib/stageColumns'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

export type GetEtapasSeleccionResult =
  { ok: true; data: EtapaSeleccionItem[] } | { ok: false; error: string }

/**
 * Columnas del tablero de selección: las etapas activas, en orden.
 *
 * Puede devolver una lista VACÍA y eso es normal: el seed no siembra
 * etapas, las crea cada empresa desde el propio tablero. La UI lo explica en
 * vez de mostrar un tablero sin columnas.
 */
export async function getEtapasSeleccion(): Promise<GetEtapasSeleccionResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const stages = await fetchStageColumns(await createClient())
  if (!stages) {
    return { ok: false, error: 'No se pudieron cargar las etapas de selección.' }
  }

  return { ok: true, data: stages }
}
