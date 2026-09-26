'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { etapaSeleccionSchema, type EtapaSeleccionInput } from '@/modules/recruitment/types'

export type UpdateEtapaSeleccionResult = { ok: true } | { ok: false; error: string }

/**
 * Editar la fase de una etapa MUEVE de columna a todas las postulaciones
 * que estén paradas en ella — es el efecto buscado (si "Entrevista con
 * jefatura" en realidad es parte de la decisión, el tablero debe reflejarlo
 * para todos), pero conviene saberlo antes de tocarla.
 */
export async function updateEtapaSeleccion(
  etapaId: number,
  input: EtapaSeleccionInput
): Promise<UpdateEtapaSeleccionResult> {
  if (!Number.isInteger(etapaId) || etapaId <= 0) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }

  const parsed = etapaSeleccionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos de la etapa inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({
      eta_nombre: parsed.data.nombre,
      eta_fase: parsed.data.fase,
      eta_color: parsed.data.color,
    })
    .eq('eta_id', etapaId)

  if (error) {
    return {
      ok: false,
      error: 'No se pudo actualizar la etapa. Verifique que el nombre no esté repetido.',
    }
  }

  revalidatePath('/settings')
  revalidatePath('/recruitment')
  return { ok: true }
}
