'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { parseOptionalTime, scheduleSchema, type ScheduleInput } from '@/modules/schedules/types'

export type UpdateScheduleResult = { ok: true } | { ok: false; error: string }

export async function updateSchedule(
  id: number,
  input: ScheduleInput
): Promise<UpdateScheduleResult> {
  const parsed = scheduleSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de horario invalidos.' }
  }

  await requirePermission(PERMISOS.HORARIOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_horarios')
    .update({
      ...parsed.data,
      hor_hora_inicio_break: parseOptionalTime(parsed.data.hor_hora_inicio_break),
      hor_hora_fin_break: parseOptionalTime(parsed.data.hor_hora_fin_break),
    })
    .eq('hor_id', id)

  if (error) {
    return { ok: false, error: 'No se pudo actualizar el horario.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
