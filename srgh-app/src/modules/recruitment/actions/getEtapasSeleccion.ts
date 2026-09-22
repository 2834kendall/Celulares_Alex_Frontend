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
}

export type GetEtapasSeleccionResult =
  { ok: true; data: EtapaSeleccionItem[] } | { ok: false; error: string }

/**
 * Etapas activas del embudo de selección, con su fase (1/2/3 — ver
 * migración 20260921000000). Las etapas 14-18 (inducción, período de
 * prueba, contratación definitiva) quedaron desactivadas: ese seguimiento
 * vive en Empleados una vez la persona ya es empleada.
 */
export async function getEtapasSeleccion(): Promise<GetEtapasSeleccionResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_nombre, eta_orden, eta_fase')
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
  }))

  return { ok: true, data: etapas }
}
