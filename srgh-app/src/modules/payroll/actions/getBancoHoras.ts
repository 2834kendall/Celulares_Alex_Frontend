'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { calcularMontoSugeridoBancoHoras } from '@/modules/payroll/lib/bancoHoras'
import { periodoLabel } from '@/modules/payroll/lib/format'
import type { BancoHorasItem, EstadoBancoHoras } from '@/modules/payroll/types'

interface MovimientoRow {
  bhm_id: number
  bhm_historial_laboral_id: number
  bhm_horas: number
  bhm_salario_por_hora: number
  bhm_estado: string
  bhm_monto_pagado: number | null
  bhm_fecha_resolucion: string | null
  bhm_created_at: string
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
      emp_numero_identificacion: string | null
    } | null
  } | null
  sgrh_nomina_detalle: {
    sgrh_nomina_periodo: {
      npe_periodo_mes: number
      npe_periodo_anio: number
      npe_quincena: number
    } | null
  } | null
}

export type GetBancoHorasResult =
  | { ok: true; data: { pendientes: BancoHorasItem[]; historial: BancoHorasItem[] } }
  | { ok: false; error: string }

/**
 * Lista los movimientos del banco de horas: pendientes (por resolver) e
 * historial (ya pagados o compensados). RLS ya limita esto a la empresa del
 * JWT — aquí solo se pide el permiso de nómina para mostrar la pantalla.
 */
export async function getBancoHoras(): Promise<GetBancoHorasResult> {
  await requirePermission(PERMISOS.NOMINA_READ)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_banco_horas_movimientos')
    .select(
      `
      bhm_id,
      bhm_historial_laboral_id,
      bhm_horas,
      bhm_salario_por_hora,
      bhm_estado,
      bhm_monto_pagado,
      bhm_fecha_resolucion,
      bhm_created_at,
      sgrh_historial_laboral (
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion )
      ),
      sgrh_nomina_detalle (
        sgrh_nomina_periodo ( npe_periodo_mes, npe_periodo_anio, npe_quincena )
      )
    `
    )
    .order('bhm_created_at', { ascending: false })
    .returns<MovimientoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudo cargar el banco de horas.' }
  }

  const items: BancoHorasItem[] = (data ?? []).map((row) => {
    const empleado = row.sgrh_historial_laboral?.sgrh_empleados
    const nombre = empleado
      ? [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
          .filter(Boolean)
          .join(' ')
      : 'Empleado no disponible'

    const periodo = row.sgrh_nomina_detalle?.sgrh_nomina_periodo
    const periodoOrigenLabel = periodo
      ? periodoLabel(periodo.npe_periodo_mes, periodo.npe_periodo_anio, periodo.npe_quincena)
      : '—'

    return {
      id: row.bhm_id,
      historialLaboralId: row.bhm_historial_laboral_id,
      empleadoNombre: nombre,
      empleadoCedula: empleado?.emp_numero_identificacion ?? '—',
      periodoOrigenLabel,
      horas: row.bhm_horas,
      salarioPorHora: row.bhm_salario_por_hora,
      montoSugerido: calcularMontoSugeridoBancoHoras(row.bhm_horas, row.bhm_salario_por_hora),
      estado: row.bhm_estado as EstadoBancoHoras,
      montoPagado: row.bhm_monto_pagado,
      fechaResolucion: row.bhm_fecha_resolucion,
      createdAt: row.bhm_created_at,
    }
  })

  return {
    ok: true,
    data: {
      pendientes: items.filter((i) => i.estado === 'pendiente'),
      historial: items.filter((i) => i.estado !== 'pendiente'),
    },
  }
}
