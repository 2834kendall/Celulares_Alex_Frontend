'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  ERROR_SIN_PERMISO_AUSENCIAS,
  puedeLeerAusencias,
  sucursalesVisibles,
} from '@/modules/payroll/lib/derechosData'
import {
  calcularBasesLiquidacion,
  cargarHistorialParaLiquidacion,
} from '@/modules/payroll/lib/liquidacionData'
import type { VacacionesPropuestas } from '@/modules/payroll/lib/derechos'

export type ProponerVacacionesResult =
  | { ok: true; data: VacacionesPropuestas & { inicioRelacion: string } }
  | { ok: false; error: string }

/**
 * Días de vacaciones que el sistema propone liquidar para un contrato ya
 * terminado, para prellenar el formulario. No escribe nada. Usa exactamente
 * las mismas bases que procesarLiquidacion (lib/liquidacionData.ts), así lo
 * que se propone es lo que después queda guardado como propuesta. La fecha de
 * salida es la que registró RRHH al terminar el contrato.
 */
export async function proponerVacacionesLiquidacion(
  historialLaboralId: number
): Promise<ProponerVacacionesResult> {
  if (!Number.isInteger(historialLaboralId) || historialLaboralId <= 0) {
    return { ok: false, error: 'Contrato inválido.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  if (!puedeLeerAusencias(claims)) {
    return { ok: false, error: ERROR_SIN_PERMISO_AUSENCIAS }
  }

  const supabase = await createClient()
  const historial = await cargarHistorialParaLiquidacion(supabase, historialLaboralId)
  if (!historial.ok) return historial

  const bases = await calcularBasesLiquidacion(
    supabase,
    historial.data,
    historial.data.lab_fecha_fin,
    sucursalesVisibles(claims)
  )
  if (!bases.ok) return bases

  return {
    ok: true,
    data: { ...bases.data.vacaciones, inicioRelacion: bases.data.inicioRelacion },
  }
}
