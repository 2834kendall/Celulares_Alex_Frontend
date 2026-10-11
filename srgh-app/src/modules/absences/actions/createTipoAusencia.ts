'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { tipoAusenciaSchema, type TipoAusenciaInput } from '@/modules/absences/types'
import { tipoAusenciaDbError } from '@/modules/absences/lib/tipoAusenciaErrors'

export type CreateTipoAusenciaResult = { ok: true; id: number } | { ok: false; error: string }

export async function createTipoAusencia(
  input: TipoAusenciaInput
): Promise<CreateTipoAusenciaResult> {
  const parsed = tipoAusenciaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del tipo de ausencia invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_ausencia')
    .insert(parsed.data)
    .select('tau_id')
    .single()

  if (error) {
    return { ok: false, error: tipoAusenciaDbError(error, parsed.data.tau_codigo, 'crear') }
  }

  revalidatePath('/settings', 'layout')
  revalidatePath('/schedule')
  return { ok: true, id: data.tau_id }
}
