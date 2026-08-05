'use server'

import { createClient } from '@/lib/supabase/server'
import type { ShiftTypeRow } from '@/modules/schedules/types'

export type ShiftType = ShiftTypeRow

export type GetShiftTypesResult = { ok: true; data: ShiftType[] } | { ok: false; error: string }

/*
 Catalogo de tipos de jornada (Diurna/Mixta/Nocturna). No requiere
 HORARIOS_READ: es un catalogo global, legible por cualquier autenticado
  (policy "cat_select" en sgrh_cat_tipos_jornada).
 */
export async function getShiftTypes(): Promise<GetShiftTypesResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_jornada')
    .select(
      'tjo_id, tjo_codigo, tjo_nombre, tjo_horas_max_diarias, tjo_horas_max_semanales, tjo_recargo_porcentaje'
    )
    .order('tjo_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los tipos de jornada.' }
  }

  return { ok: true, data }
}
