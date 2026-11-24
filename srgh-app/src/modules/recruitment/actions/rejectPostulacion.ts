'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  rechazarPostulacionSchema,
  type RechazarPostulacionInput,
} from '@/modules/recruitment/types'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

export type RejectPostulacionResult = { ok: true } | { ok: false; error: string }

/** Cierra una postulación como descartada, con motivo. */
export async function rejectPostulacion(
  input: RechazarPostulacionInput
): Promise<RejectPostulacionResult> {
  const parsed = rechazarPostulacionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Indica el motivo del descarte.' }
  }

  await requirePermission(PERMISOS.RECLUTAMIENTO_WRITE)

  const supabase = await createClient()
  const { data: postulacion, error } = await supabase
    .from('sgrh_postulaciones')
    .update({
      pos_estado_final: 'descartado',
      pos_motivo_descarte: parsed.data.motivo,
      // Fecha de Costa Rica, no la UTC: cerrar la postulacion despues de las
      // 6 p. m. guardaba el dia siguiente (QA, SGRH-115).
      pos_fecha_cierre: todayInCostaRica(),
    })
    .eq('pos_id', parsed.data.postulacionId)
    .eq('pos_estado_final', 'en_proceso')
    .select('pos_candidato_id')
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'No se pudo descartar la postulación.' }
  }
  if (!postulacion) {
    return { ok: false, error: 'La postulación ya no está en proceso.' }
  }

  revalidatePath('/recruitment')
  revalidatePath(`/recruitment/candidates/${postulacion.pos_candidato_id}`)
  return { ok: true }
}
