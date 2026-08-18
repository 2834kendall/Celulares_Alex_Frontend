'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { parseOptionalSalary, puestoSchema, type PuestoInput } from '@/modules/settings/types'

export type CreatePuestoResult = { ok: true; id: number } | { ok: false; error: string }

export async function createPuesto(input: PuestoInput): Promise<CreatePuestoResult> {
  const parsed = puestoSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de puesto invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.CATALOGOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_puestos')
    .insert({
      pue_nombre: parsed.data.pue_nombre,
      pue_descripcion: parsed.data.pue_descripcion?.trim() || null,
      pue_salario_minimo_referencia: parseOptionalSalary(parsed.data.pue_salario_minimo_referencia),
      pue_activo: parsed.data.pue_activo,
      pue_empresa_id: empresaId,
    })
    .select('pue_id')
    .single()

  if (error) {
    return { ok: false, error: 'No se pudo crear el puesto.' }
  }

  revalidatePath('/settings')
  return { ok: true, id: data.pue_id }
}
