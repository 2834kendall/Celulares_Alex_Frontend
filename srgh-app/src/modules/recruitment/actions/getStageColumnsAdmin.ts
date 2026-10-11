'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { fetchInactiveStages, fetchStageColumns } from '@/modules/recruitment/lib/stageColumns'
import type { InactiveStageItem, StageColumnAdminItem } from '@/modules/recruitment/types'

export type GetStageColumnsAdminResult =
  | { ok: true; data: StageColumnAdminItem[]; inactive: InactiveStageItem[] }
  | { ok: false; error: string }

/**
 * Columnas del tablero para la pantalla de ADMINISTRACIÓN (Configuración).
 *
 * Exige CATALOGOS_WRITE, no RECLUTAMIENTO_READ: es el mismo permiso que
 * piden crear, editar, reordenar y eliminar, y pedir el de Reclutamiento
 * mandaría a /unauthorized a un administrador de catálogos sin acceso al
 * módulo. Para el tablero está getEtapasSeleccion.
 *
 * Cada columna trae cuántas postulaciones en proceso tiene hoy: con
 * candidatos adentro no se elimina. El conteo es lo que la RLS deja ver a
 * quien consulta; si la lectura falla sale en 0 y el servidor igual vuelve a
 * comprobar al eliminar.
 *
 * También trae las etapas DESACTIVADAS: no son columnas, pero siguen en el
 * catálogo (ocupan su nombre, que es único) y sin esta lista no había forma
 * de verlas ni de recuperarlas.
 */
export async function getStageColumnsAdmin(): Promise<GetStageColumnsAdminResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const [stages, inactive, applications] = await Promise.all([
    fetchStageColumns(supabase),
    fetchInactiveStages(supabase),
    supabase
      .from('sgrh_postulaciones')
      .select('pos_etapa_actual_id')
      .eq('pos_estado_final', 'en_proceso')
      .not('pos_etapa_actual_id', 'is', null)
      .returns<{ pos_etapa_actual_id: number }[]>(),
  ])

  if (!stages) {
    return { ok: false, error: 'No se pudieron cargar las columnas del tablero.' }
  }

  const counts = new Map<number, number>()
  for (const row of applications.data ?? []) {
    counts.set(row.pos_etapa_actual_id, (counts.get(row.pos_etapa_actual_id) ?? 0) + 1)
  }

  return {
    ok: true,
    data: stages.map((stage) => ({ ...stage, cardCount: counts.get(stage.id) ?? 0 })),
    inactive: (inactive ?? []).map((stage) => ({
      ...stage,
      cardCount: counts.get(stage.id) ?? 0,
    })),
  }
}
