'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { scheduleSchema, toScheduleColumns, type ScheduleInput } from '@/modules/schedules/types'
import { templateBranchesBelongToEmpresa } from '@/modules/schedules/lib/validateBranches'

export type UpdateScheduleResult = { ok: true } | { ok: false; error: string }

export async function updateSchedule(
  id: number,
  input: ScheduleInput
): Promise<UpdateScheduleResult> {
  const parsed = scheduleSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de horario invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.HORARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number } | undefined)?.empresa_id
  const columns = toScheduleColumns(parsed.data)

  const supabase = await createClient()

  // Solo hace falta saber la empresa cuando la plantilla trae sucursales por bloque.
  if (columns.hor_sucursal_id || columns.hor_sucursal_id_2) {
    if (!empresaId) {
      return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
    }
    if (!(await templateBranchesBelongToEmpresa(supabase, empresaId, columns))) {
      return { ok: false, error: 'La sucursal seleccionada no es válida para tu empresa.' }
    }
  }

  const { error } = await supabase.from('sgrh_cat_horarios').update(columns).eq('hor_id', id)

  if (error) {
    return { ok: false, error: 'No se pudo actualizar el horario.' }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
