'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  HORAS_ANULAR_PAGO_MAX,
  HORAS_ANULAR_PAGO_MIN,
} from '@/modules/payroll/lib/anulacionPagosReglas'
import type { SgrhJwtClaims } from '@/types/auth'

const horasSchema = z.number().int().min(HORAS_ANULAR_PAGO_MIN).max(HORAS_ANULAR_PAGO_MAX)

export type UpdateHorasAnularPagoResult = { ok: true } | { ok: false; error: string }

/**
 * Cambia el plazo para anular un pago de aguinaldo o liquidación hecho por
 * error (org_horas_anular_pago). Aplica a toda la empresa y a los pagos ya
 * hechos: el plazo se mide desde cada pago con el valor vigente al anular.
 *
 * EMPRESAS_WRITE, igual que el formato de hora: lo fija quien administra la
 * empresa, no quien paga. El `org_id` sale de los claims, nunca del cliente.
 */
export async function updateHorasAnularPago(horas: number): Promise<UpdateHorasAnularPagoResult> {
  const parsed = horasSchema.safeParse(horas)
  if (!parsed.success) {
    return {
      ok: false,
      error: `Indicá un número entero de horas entre ${HORAS_ANULAR_PAGO_MIN} y ${HORAS_ANULAR_PAGO_MAX}.`,
    }
  }

  const claims = await requirePermission(PERMISOS.EMPRESAS_WRITE)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  if (!meta.empresa_id) {
    return { ok: false, error: 'No se encontró la empresa del usuario.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_empresas')
    .update({ org_horas_anular_pago: parsed.data })
    .eq('org_id', meta.empresa_id)
    .select('org_id')

  // Sin filas = la RLS filtró el UPDATE en silencio.
  if (error || !data || data.length === 0) {
    return { ok: false, error: 'No se pudo guardar el plazo.' }
  }

  revalidatePath('/settings/general')
  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true }
}
