'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

interface EtapaQueryRow {
  eta_id: number
  eta_nombre: string
  eta_orden: number
  eta_fase: number | null
  eta_color: string | null
}

export type GetEtapasSeleccionResult =
  { ok: true; data: EtapaSeleccionItem[] } | { ok: false; error: string }

/**
 * Etapas activas del embudo, con su fase (1/2/3 = columna del tablero),
 * para el selector de "avanzar etapa".
 *
 * Puede devolver una lista VACÍA y eso es normal: desde SGRH-61 el seed no
 * siembra etapas — las crea cada empresa desde Configuración → Etapas de
 * selección. La UI avisa y manda ahí en vez de mostrar un selector vacío.
 */
export async function getEtapasSeleccion(): Promise<GetEtapasSeleccionResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_nombre, eta_orden, eta_fase, eta_color')
    .eq('eta_activo', true)
    .order('eta_orden', { ascending: true })
    .returns<EtapaQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar las etapas de selección.' }
  }

  // eta_fase es NULL solo para etapas desactivadas por la migración, que ya
  // se filtraron arriba — cae a fase 2 ("en evaluación") como resguardo si
  // algún entorno tuviera una etapa activa sin fase asignada.
  const etapas: EtapaSeleccionItem[] = (data ?? []).map((row) => ({
    id: row.eta_id,
    nombre: row.eta_nombre,
    orden: row.eta_orden,
    fase: (row.eta_fase ?? 2) as 1 | 2 | 3,
    color: row.eta_color,
  }))

  return { ok: true, data: etapas }
}
