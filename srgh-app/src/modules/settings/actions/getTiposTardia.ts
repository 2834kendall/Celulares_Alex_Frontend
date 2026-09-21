'use server'

import { createClient } from '@/lib/supabase/server'
import type { TipoTardiaRow } from '@/modules/settings/types'

export type TipoTardia = TipoTardiaRow

export type GetTiposTardiaResult = { ok: true; data: TipoTardia[] } | { ok: false; error: string }

/**
 * Catalogo de tipos de tardia de la empresa, ordenado por el minuto donde
 * empieza cada uno — el orden en que se leen los rangos. Legible por
 * cualquier autenticado de la empresa (policy "tipos_tardia_select"): el
 * panel de asistencia lo necesita tanto como Configuracion.
 */
export async function getTiposTardia(): Promise<GetTiposTardiaResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_tardia')
    .select(
      'tta_id, tta_empresa_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color, tta_created_at'
    )
    .order('tta_desde_minutos', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los tipos de tardia.' }
  }

  return { ok: true, data }
}
