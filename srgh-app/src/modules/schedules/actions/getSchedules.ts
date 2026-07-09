'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { ScheduleRow } from '@/modules/schedules/types'

export type GetSchedulesResult = { ok: true; data: ScheduleRow[] } | { ok: false; error: string }

export async function getSchedules(): Promise<GetSchedulesResult> {
  await requirePermission(PERMISOS.HORARIOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_horarios')
    .select('*')
    .order('hor_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los horarios.' }
  }

  return { ok: true, data }
}
