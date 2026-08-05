'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { crearPeriodoSchema, type CrearPeriodoInput } from '@/modules/payroll/types'

export type CreatePeriodoResult = { ok: true; periodoId: number } | { ok: false; error: string }

/**
 * Crea un periodo de planilla en estado 'borrador'.
 * El empresa_id sale del JWT (nunca del formulario) y RLS lo re-verifica
 * en el WITH CHECK del insert junto con el permiso NOMINA_WRITE.
 */
export async function createPeriodo(input: CrearPeriodoInput): Promise<CreatePeriodoResult> {
  const parsed = crearPeriodoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Datos del periodo inválidos.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_nomina_periodo')
    .insert({
      ...parsed.data,
      npe_empresa_id: empresaId,
    })
    .select('npe_id')
    .single()

  if (error || !data) {
    if (error?.code === '23505') {
      return {
        ok: false,
        error: 'Ya existe un periodo para esa sucursal, mes y quincena.',
      }
    }
    if (error?.code === '42501') {
      return { ok: false, error: 'No tienes permiso para crear periodos de nómina.' }
    }
    return { ok: false, error: 'No se pudo crear el periodo de nómina.' }
  }

  revalidatePath('/payroll')
  return { ok: true, periodoId: data.npe_id }
}
