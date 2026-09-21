'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { tipoTardiaSchema, type TipoTardiaInput } from '@/modules/settings/types'
import { tipoTardiaDbError } from '@/modules/settings/lib/tipoTardiaErrors'

export type CreateTipoTardiaResult = { ok: true; id: number } | { ok: false; error: string }

export async function createTipoTardia(input: TipoTardiaInput): Promise<CreateTipoTardiaResult> {
  const parsed = tipoTardiaSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos del tipo de tardia invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.CATALOGOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_tardia')
    .insert({
      tta_empresa_id: empresaId,
      tta_nombre: parsed.data.tta_nombre,
      tta_desde_minutos: parsed.data.tta_desde_minutos,
      tta_cuenta_advertencia: parsed.data.tta_cuenta_advertencia,
      tta_color: parsed.data.tta_color,
    })
    .select('tta_id')
    .single()

  if (error) {
    return { ok: false, error: tipoTardiaDbError(error, parsed.data.tta_desde_minutos, 'crear') }
  }

  revalidatePath('/settings')
  revalidatePath('/attendance')
  return { ok: true, id: data.tta_id }
}
