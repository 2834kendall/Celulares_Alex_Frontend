'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { scheduleSchema, type ScheduleInput } from '@/modules/schedules/types'

export type CreateScheduleResult = { ok: true; id: number } | { ok: false; error: string }

export async function createSchedule(input: ScheduleInput): Promise<CreateScheduleResult> {
  const parsed = scheduleSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de horario invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.HORARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_horarios')
    .insert({ ...parsed.data, hor_empresa_id: empresaId })
    .select('hor_id')
    .single()

  if (error) {
    return { ok: false, error: 'No se pudo crear el horario.' }
  }

  revalidatePath('/schedule')
  return { ok: true, id: data.hor_id }
}
