'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { parseOptionalHours, shiftTypeSchema, type ShiftTypeInput } from '@/modules/schedules/types'

export type CreateShiftTypeResult = { ok: true; id: number } | { ok: false; error: string }

export async function createShiftType(input: ShiftTypeInput): Promise<CreateShiftTypeResult> {
  const parsed = shiftTypeSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de tipo de jornada invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_jornada')
    .insert({
      tjo_codigo: parsed.data.tjo_codigo,
      tjo_nombre: parsed.data.tjo_nombre,
      tjo_horas_max_diarias: parseOptionalHours(parsed.data.tjo_horas_max_diarias),
      tjo_horas_max_semanales: parseOptionalHours(parsed.data.tjo_horas_max_semanales),
      tjo_recargo_porcentaje: parsed.data.tjo_recargo_porcentaje,
    })
    .select('tjo_id')
    .single()

  if (error) {
    return {
      ok: false,
      error: 'No se pudo crear el tipo de jornada. Verifique que el codigo no este repetido.',
    }
  }

  revalidatePath('/schedule')
  return { ok: true, id: data.tjo_id }
}
