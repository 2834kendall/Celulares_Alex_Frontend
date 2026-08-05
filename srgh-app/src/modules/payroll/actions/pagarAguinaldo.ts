'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type PagarAguinaldoResult = { ok: true } | { ok: false; error: string }

/** 'YYYY-MM-DD' en horario local, sin pasar por Date→ISOString (evita el corrimiento UTC). */
function hoyLocal(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

/**
 * Marca el aguinaldo de un empleado, para un año de ciclo dado, como pagado.
 * No cambia el monto acumulado: ese ya se fue armando con cada pago de
 * nómina marcado como pagado durante el ciclo (ver marcarDetallePagado.ts).
 */
export async function pagarAguinaldo(
  historialLaboralId: number,
  anio: number
): Promise<PagarAguinaldoResult> {
  if (!Number.isInteger(historialLaboralId) || historialLaboralId <= 0) {
    return { ok: false, error: 'Empleado inválido.' }
  }
  if (!Number.isInteger(anio) || anio < 2000) {
    return { ok: false, error: 'Año inválido.' }
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)
  const supabase = await createClient()

  const { data: provision, error: errProvision } = await supabase
    .from('sgrh_provisiones_anuales')
    .select('pra_id, pra_aguinaldo_pagado')
    .eq('pra_historial_laboral_id', historialLaboralId)
    .eq('pra_anio', anio)
    .maybeSingle<{ pra_id: number; pra_aguinaldo_pagado: boolean }>()

  if (errProvision) {
    return { ok: false, error: 'No se pudo cargar la provisión de aguinaldo.' }
  }
  if (!provision) {
    return {
      ok: false,
      error: 'Este empleado todavía no tiene aguinaldo acumulado en este ciclo.',
    }
  }
  if (provision.pra_aguinaldo_pagado) {
    return { ok: false, error: 'Este aguinaldo ya estaba marcado como pagado.' }
  }

  const { error: errUpdate } = await supabase
    .from('sgrh_provisiones_anuales')
    .update({
      pra_aguinaldo_pagado: true,
      pra_fecha_pago_aguinaldo: hoyLocal(),
    })
    .eq('pra_id', provision.pra_id)

  if (errUpdate) {
    return { ok: false, error: 'No se pudo marcar el aguinaldo como pagado.' }
  }

  revalidatePath('/payroll/aguinaldo-liquidacion')
  return { ok: true }
}
