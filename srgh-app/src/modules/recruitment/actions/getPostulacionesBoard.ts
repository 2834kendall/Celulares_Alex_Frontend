'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { fetchStageColumns } from '@/modules/recruitment/lib/stageColumns'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

export interface PostulacionBoardItem {
  posId: number
  candidatoId: number
  candidatoNombre: string
  puestoNombre: string
  sucursalNombre: string | null
  fechaPostula: string
  puntajePromedio: number | null
  /** Etapa actual. null = recién creada; puede ser una etapa ya desactivada. */
  etapaId: number | null
  etapaNombre: string | null
  etapaColor: string | null
}

interface PostulacionQueryRow {
  pos_id: number
  pos_candidato_id: number
  pos_fecha_postula: string
  pos_puntaje_promedio: number | null
  sgrh_candidatos: {
    cdt_nombre: string
    cdt_apellido_1: string
    cdt_apellido_2: string | null
  } | null
  sgrh_cat_puestos: { pue_nombre: string } | null
  sgrh_sucursales: { suc_nombre: string } | null
  pos_etapa_actual_id: number | null
  sgrh_cat_etapas_seleccion: {
    eta_nombre: string
    eta_color: string | null
  } | null
}

export type GetPostulacionesBoardResult =
  | { ok: true; data: PostulacionBoardItem[]; stages: EtapaSeleccionItem[] }
  | { ok: false; error: string }

/**
 * Tablero de selección: las postulaciones en_proceso y las columnas (etapas
 * activas, en orden). La RLS ya limita las postulaciones a la empresa del
 * usuario.
 *
 * Cada postulación trae su `etapaId`; el tablero la ubica en la columna con
 * ese id. Si no tiene etapa, o su etapa ya no es una columna (se desactivó),
 * el tablero la muestra aparte como "Sin etapa" para que alguien la acomode.
 */
export async function getPostulacionesBoard(): Promise<GetPostulacionesBoardResult> {
  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()
  const [{ data, error }, stages] = await Promise.all([
    supabase
      .from('sgrh_postulaciones')
      .select(
        `
      pos_id,
      pos_candidato_id,
      pos_fecha_postula,
      pos_puntaje_promedio,
      pos_etapa_actual_id,
      sgrh_candidatos ( cdt_nombre, cdt_apellido_1, cdt_apellido_2 ),
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre ),
      sgrh_cat_etapas_seleccion ( eta_nombre, eta_color )
    `
      )
      .eq('pos_estado_final', 'en_proceso')
      .order('pos_fecha_postula', { ascending: true })
      .returns<PostulacionQueryRow[]>(),
    fetchStageColumns(supabase),
  ])

  if (error || !stages) {
    return { ok: false, error: 'No se pudieron cargar las postulaciones.' }
  }

  const items: PostulacionBoardItem[] = (data ?? []).map((row) => {
    const candidato = row.sgrh_candidatos
    const nombreCompleto = candidato
      ? [candidato.cdt_nombre, candidato.cdt_apellido_1, candidato.cdt_apellido_2]
          .filter(Boolean)
          .join(' ')
      : '—'

    return {
      posId: row.pos_id,
      candidatoId: row.pos_candidato_id,
      candidatoNombre: nombreCompleto,
      puestoNombre: row.sgrh_cat_puestos?.pue_nombre ?? '—',
      sucursalNombre: row.sgrh_sucursales?.suc_nombre ?? null,
      fechaPostula: row.pos_fecha_postula,
      puntajePromedio: row.pos_puntaje_promedio,
      etapaId: row.pos_etapa_actual_id,
      etapaNombre: row.sgrh_cat_etapas_seleccion?.eta_nombre ?? null,
      etapaColor: row.sgrh_cat_etapas_seleccion?.eta_color ?? null,
    }
  })

  return { ok: true, data: items, stages }
}
