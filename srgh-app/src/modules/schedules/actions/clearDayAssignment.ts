'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type ClearDayAssignmentResult = { ok: true } | { ok: false; error: string }

/** Vuelve un dia a "Sin asignar": la matriz no distingue ese estado con una columna, solo con la ausencia de la fila. */
export async function clearDayAssignment(assignmentId: number): Promise<ClearDayAssignmentResult> {
  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_WRITE.
  await requirePermission(PERMISOS.ASISTENCIA_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_programacion_semanal')
    .delete()
    .eq('prg_id', assignmentId)

  if (error) {
    return { ok: false, error: 'No se pudo quitar la asignacion.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
