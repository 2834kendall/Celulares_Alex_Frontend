'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { tipoAusenciaSchema, type TipoAusenciaInput } from '@/modules/absences/types'
import { tipoAusenciaDbError } from '@/modules/absences/lib/tipoAusenciaErrors'

export type UpdateTipoAusenciaResult = { ok: true } | { ok: false; error: string }

// El código no se actualiza: es el identificador estable que usan otros módulos.
export async function updateTipoAusencia(
  id: number,
  input: TipoAusenciaInput
): Promise<UpdateTipoAusenciaResult> {
  const parsed = tipoAusenciaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del tipo de ausencia invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const { tau_codigo, ...cambios } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('sgrh_cat_tipos_ausencia').update(cambios).eq('tau_id', id)

  if (error) {
    return { ok: false, error: tipoAusenciaDbError(error, tau_codigo, 'actualizar') }
  }

  revalidatePath('/settings', 'layout')
  revalidatePath('/schedule')
  return { ok: true }
}
