'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { LiquidacionListItem } from '@/modules/payroll/types'

interface LiquidacionRow {
  liq_id: number
  liq_fecha_salida: string
  liq_total: number
  liq_pagado: boolean
  liq_created_at: string
  sgrh_cat_motivos_salida: { mot_nombre: string } | null
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
      emp_numero_identificacion: string
    } | null
  } | null
}

export type GetLiquidacionesResult =
  { ok: true; data: LiquidacionListItem[] } | { ok: false; error: string }

/**
 * Historial de liquidaciones ya generadas, más recientes primero. Solo puede
 * existir una por contrato (liq_historial_laboral_id es UNIQUE), así que esta
 * lista es, en la práctica, "empleados que salieron y ya se les liquidó".
 * RLS ya limita esto a la empresa del JWT — aquí solo se pide el permiso de
 * lectura de nómina para mostrar la pantalla.
 */
export async function getLiquidaciones(): Promise<GetLiquidacionesResult> {
  await requirePermission(PERMISOS.NOMINA_READ)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_liquidaciones')
    .select(
      `
      liq_id,
      liq_fecha_salida,
      liq_total,
      liq_pagado,
      liq_created_at,
      sgrh_cat_motivos_salida ( mot_nombre ),
      sgrh_historial_laboral (
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion )
      )
    `
    )
    .order('liq_created_at', { ascending: false })
    .returns<LiquidacionRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el historial de liquidaciones.' }
  }

  const items: LiquidacionListItem[] = (data ?? []).map((row) => {
    const empleado = row.sgrh_historial_laboral?.sgrh_empleados
    const empleadoNombre = empleado
      ? [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
          .filter(Boolean)
          .join(' ')
      : 'Empleado no disponible'

    return {
      liqId: row.liq_id,
      empleadoNombre,
      empleadoCedula: empleado?.emp_numero_identificacion ?? '—',
      fechaSalida: row.liq_fecha_salida,
      motivoNombre: row.sgrh_cat_motivos_salida?.mot_nombre ?? '—',
      total: row.liq_total,
      pagado: row.liq_pagado,
      createdAt: row.liq_created_at,
    }
  })

  return { ok: true, data: items }
}
