'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getTodosEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import type { EmpleadoActivoItem } from '@/modules/payroll/types'

export type GetEmpleadosActivosParaLiquidacionResult =
  { ok: true; data: EmpleadoActivoItem[] } | { ok: false; error: string }

/** Empleados con contrato vigente, para elegir a quién liquidar. */
export async function getEmpleadosActivosParaLiquidacion(): Promise<GetEmpleadosActivosParaLiquidacionResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const supabase = await createClient()
  const resultado = await getTodosEmpleadosActivos(supabase)

  if (!resultado.ok) {
    return { ok: false, error: resultado.error }
  }

  return {
    ok: true,
    data: resultado.data
      .map((e) => ({ historialLaboralId: e.labId, nombre: e.nombre, cedula: e.cedula }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}
