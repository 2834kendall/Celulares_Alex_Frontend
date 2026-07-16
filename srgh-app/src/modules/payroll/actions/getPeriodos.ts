'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { PeriodoListItem } from '@/modules/payroll/types'

interface PeriodoQueryRow {
  npe_id: number
  npe_periodo_mes: number
  npe_periodo_anio: number
  npe_quincena: number
  npe_fecha_inicio_periodo: string | null
  npe_fecha_fin_periodo: string | null
  npe_estado: string
  npe_fecha_pago: string | null
  sgrh_sucursales: { suc_nombre: string | null } | null
  sgrh_nomina_detalle: { count: number }[]
}

export type GetPeriodosResult = { ok: true; data: PeriodoListItem[] } | { ok: false; error: string }

/**
 * Periodos de planilla de la empresa, del más reciente al más antiguo.
 * RLS (nomina_periodo_select) ya limita a la empresa del JWT y exige
 * NOMINA_READ — el requirePermission de aquí solo corta antes y barato.
 */
export async function getPeriodos(): Promise<GetPeriodosResult> {
  await requirePermission(PERMISOS.NOMINA_READ)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_nomina_periodo')
    .select(
      `
      npe_id,
      npe_periodo_mes,
      npe_periodo_anio,
      npe_quincena,
      npe_fecha_inicio_periodo,
      npe_fecha_fin_periodo,
      npe_estado,
      npe_fecha_pago,
      sgrh_sucursales ( suc_nombre ),
      sgrh_nomina_detalle ( count )
    `
    )
    .order('npe_periodo_anio', { ascending: false })
    .order('npe_periodo_mes', { ascending: false })
    .order('npe_quincena', { ascending: false })
    .returns<PeriodoQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los periodos de nómina.' }
  }

  const periodos: PeriodoListItem[] = (data ?? []).map((row) => ({
    id: row.npe_id,
    mes: row.npe_periodo_mes,
    anio: row.npe_periodo_anio,
    quincena: row.npe_quincena,
    fechaInicio: row.npe_fecha_inicio_periodo,
    fechaFin: row.npe_fecha_fin_periodo,
    estado: row.npe_estado,
    fechaPago: row.npe_fecha_pago,
    sucursalNombre: row.sgrh_sucursales?.suc_nombre ?? '—',
    totalEmpleados: row.sgrh_nomina_detalle?.[0]?.count ?? 0,
  }))

  return { ok: true, data: periodos }
}
