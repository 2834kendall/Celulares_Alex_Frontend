'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { EtapaSeleccionRow } from '@/modules/recruitment/types'

interface EtapaQueryRow {
  eta_id: number
  eta_nombre: string
  eta_orden: number
  eta_fase: number | null
  eta_color: string | null
  eta_activo: boolean
}

export type GetEtapasSeleccionAdminResult =
  { ok: true; data: EtapaSeleccionRow[] } | { ok: false; error: string }

/**
 * Etapas para la pantalla de ADMINISTRACIÓN (Configuración). Exige
 * CATALOGOS_WRITE, no RECLUTAMIENTO_READ: es el mismo permiso que piden
 * create/update/delete, y pedir el de Reclutamiento haría que un admin de
 * catálogos sin acceso al módulo se comiera un redirect a /unauthorized al
 * abrir Configuración. Para el selector de "avanzar etapa" está
 * getEtapasSeleccion, que sí pide RECLUTAMIENTO_READ.
 */
export async function getEtapasSeleccionAdmin(): Promise<GetEtapasSeleccionAdminResult> {
  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_nombre, eta_orden, eta_fase, eta_color, eta_activo')
    .eq('eta_activo', true)
    .order('eta_orden', { ascending: true })
    .returns<EtapaQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar las etapas de selección.' }
  }

  const etapas: EtapaSeleccionRow[] = (data ?? []).map((row) => ({
    id: row.eta_id,
    nombre: row.eta_nombre,
    orden: row.eta_orden,
    fase: (row.eta_fase ?? 2) as 1 | 2 | 3,
    color: row.eta_color,
    activo: row.eta_activo,
  }))

  return { ok: true, data: etapas }
}
