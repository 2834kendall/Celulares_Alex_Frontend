'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { etapaSeleccionSchema, type EtapaSeleccionInput } from '@/modules/recruitment/types'

export type CreateEtapaSeleccionResult = { ok: true; id: number } | { ok: false; error: string }

/**
 * Crea una etapa del embudo. El orden NO se pide en el formulario: se
 * asigna solo al final de la lista (max + 1). Pedirlo obligaría a pensar un
 * número cada vez y a reacomodar el resto a mano; acá alcanza con que las
 * etapas salgan en el orden en que se fueron creando dentro de su fase.
 */
export async function createEtapaSeleccion(
  input: EtapaSeleccionInput
): Promise<CreateEtapaSeleccionResult> {
  const parsed = etapaSeleccionSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: 'Datos de la etapa inválidos.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()

  const { data: ultima } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_orden')
    .order('eta_orden', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: etapa, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .insert({
      eta_nombre: parsed.data.nombre,
      eta_fase: parsed.data.fase,
      eta_color: parsed.data.color,
      eta_orden: (ultima?.eta_orden ?? 0) + 1,
      eta_activo: true,
    })
    .select('eta_id')
    .single()

  if (error || !etapa) {
    return {
      ok: false,
      error: 'No se pudo crear la etapa. Verifique que el nombre no esté repetido.',
    }
  }

  revalidatePath('/settings')
  revalidatePath('/recruitment')
  return { ok: true, id: etapa.eta_id }
}
