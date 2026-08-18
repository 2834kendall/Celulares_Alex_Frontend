'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { parseOptionalSalary, puestoSchema, type PuestoInput } from '@/modules/settings/types'

export type UpdatePuestoResult = { ok: true } | { ok: false; error: string }

export async function updatePuesto(id: number, input: PuestoInput): Promise<UpdatePuestoResult> {
  const parsed = puestoSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de puesto invalidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_cat_puestos')
    .update({
      pue_nombre: parsed.data.pue_nombre,
      pue_descripcion: parsed.data.pue_descripcion?.trim() || null,
      pue_salario_minimo_referencia: parseOptionalSalary(parsed.data.pue_salario_minimo_referencia),
      pue_activo: parsed.data.pue_activo,
    })
    .eq('pue_id', id)

  if (error) {
    return { ok: false, error: 'No se pudo actualizar el puesto.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}
