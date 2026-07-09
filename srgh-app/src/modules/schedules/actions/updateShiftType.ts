'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { parseOptionalHours, shiftTypeSchema, type ShiftTypeInput } from '@/modules/schedules/types'

export type UpdateShiftTypeResult = { ok: true } | { ok: false; error: string }

export async function updateShiftType(
  id: number,
  input: ShiftTypeInput
): Promise<UpdateShiftTypeResult> {
  const parsed = shiftTypeSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de tipo de jornada invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_tipos_jornada')
    .update({
      tjo_codigo: parsed.data.tjo_codigo,
      tjo_nombre: parsed.data.tjo_nombre,
      tjo_horas_max_diarias: parseOptionalHours(parsed.data.tjo_horas_max_diarias),
      tjo_horas_max_semanales: parseOptionalHours(parsed.data.tjo_horas_max_semanales),
      tjo_recargo_porcentaje: parsed.data.tjo_recargo_porcentaje,
    })
    .eq('tjo_id', id)

  if (error) {
    return {
      ok: false,
      error: 'No se pudo actualizar el tipo de jornada. Verifique que el codigo no este repetido.',
    }
  }

  revalidatePath('/schedule')
  return { ok: true }
}
