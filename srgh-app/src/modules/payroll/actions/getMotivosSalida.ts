'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { MotivoSalidaRow } from '@/modules/payroll/types'

export type GetMotivosSalidaResult =
  { ok: true; data: MotivoSalidaRow[] } | { ok: false; error: string }

/** Catálogo de motivos de salida (despido, renuncia, etc.), con sus flags legales de cesantía/preaviso. */
export async function getMotivosSalida(): Promise<GetMotivosSalidaResult> {
  await requirePermission(PERMISOS.NOMINA_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_motivos_salida')
    .select('*')
    .order('mot_nombre', { ascending: true })
    .returns<MotivoSalidaRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el catálogo de motivos de salida.' }
  }

  return { ok: true, data: data ?? [] }
}
