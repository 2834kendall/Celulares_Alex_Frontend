'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { LineaPagoExtraordinario, PagoExtraordinario } from '@/modules/payroll/types'

interface PagoRow {
  pex_id: number
  pex_tipo: string
  pex_anio_aguinaldo: number | null
  pex_liquidacion_id: number | null
  pex_monto_bruto: number
  pex_deducciones: number
  pex_monto_neto: number
  pex_lineas: unknown
  pex_fecha_pago: string
  pex_codigo_verificacion: string
  pex_observaciones: string | null
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
      emp_numero_identificacion: string
    } | null
  } | null
  sgrh_liquidaciones: {
    liq_fecha_salida: string
    sgrh_cat_motivos_salida: { mot_nombre: string } | null
  } | null
}

export type GetPagoExtraordinarioResult =
  { ok: true; data: PagoExtraordinario } | { ok: false; error: string }

/** Un pago de aguinaldo o liquidación, para imprimir su comprobante. */
export async function getPagoExtraordinario(pagoId: number): Promise<GetPagoExtraordinarioResult> {
  if (!Number.isInteger(pagoId) || pagoId <= 0) return { ok: false, error: 'Pago inválido.' }

  await requirePermission(PERMISOS.NOMINA_READ)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_pagos_extraordinarios')
    .select(
      `pex_id, pex_tipo, pex_anio_aguinaldo, pex_liquidacion_id, pex_monto_bruto, pex_deducciones,
       pex_monto_neto, pex_lineas, pex_fecha_pago, pex_codigo_verificacion, pex_observaciones,
       sgrh_historial_laboral ( sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion ) ),
       sgrh_liquidaciones ( liq_fecha_salida, sgrh_cat_motivos_salida ( mot_nombre ) )`
    )
    .eq('pex_id', pagoId)
    .maybeSingle<PagoRow>()

  if (error) return { ok: false, error: 'No se pudo cargar el pago.' }
  if (!data) return { ok: false, error: 'El pago no existe o no es visible.' }

  const emp = data.sgrh_historial_laboral?.sgrh_empleados
  return {
    ok: true,
    data: {
      id: data.pex_id,
      tipo: data.pex_tipo === 'liquidacion' ? 'liquidacion' : 'aguinaldo',
      empleadoNombre: emp
        ? [emp.emp_nombre, emp.emp_apellido_1, emp.emp_apellido_2].filter(Boolean).join(' ')
        : 'Empleado no disponible',
      empleadoCedula: emp?.emp_numero_identificacion ?? '—',
      anioAguinaldo: data.pex_anio_aguinaldo,
      liquidacionId: data.pex_liquidacion_id,
      fechaSalida: data.sgrh_liquidaciones?.liq_fecha_salida ?? null,
      motivoSalida: data.sgrh_liquidaciones?.sgrh_cat_motivos_salida?.mot_nombre ?? null,
      montoBruto: Number(data.pex_monto_bruto),
      deducciones: Number(data.pex_deducciones),
      montoNeto: Number(data.pex_monto_neto),
      lineas: Array.isArray(data.pex_lineas) ? (data.pex_lineas as LineaPagoExtraordinario[]) : [],
      fechaPago: data.pex_fecha_pago,
      codigoVerificacion: data.pex_codigo_verificacion,
      observaciones: data.pex_observaciones,
    },
  }
}
