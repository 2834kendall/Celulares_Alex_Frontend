'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { LiquidacionListItem } from '@/modules/payroll/types'

interface LiquidacionRow {
  liq_id: number
  liq_fecha_salida: string
  liq_total: number
  liq_neto: number | null
  liq_pagado: boolean
  liq_fecha_pago: string | null
  liq_created_at: string
  liq_salario_diario: number
  liq_salario_diario_vacaciones: number | null
  liq_dias_trabajados_mes: number
  liq_salario_proporcional: number
  liq_aguinaldo_proporcional: number
  liq_dias_vacaciones_pendientes: number
  liq_vacaciones_pagadas: number
  liq_horas_extra_banco: number
  liq_dias_preaviso: number
  liq_preaviso: number
  liq_dias_cesantia: number
  liq_cesantia: number
  liq_nota_preaviso: string | null
  liq_nota_cesantia: string | null
  liq_dias_indemnizacion_plazo_fijo: number | null
  liq_indemnizacion_plazo_fijo: number | null
  liq_deducciones_obreras: number
  liq_observaciones: string | null
  sgrh_pagos_extraordinarios: { pex_id: number; pex_fecha_pago: string }[] | null
  sgrh_cat_motivos_salida: {
    mot_nombre: string
    mot_genera_preaviso: boolean
    mot_genera_cesantia: boolean
  } | null
  sgrh_historial_laboral: {
    sgrh_empleados: {
      emp_nombre: string
      emp_apellido_1: string
      emp_apellido_2: string | null
      emp_numero_identificacion: string
    } | null
  } | null
}

function notaSiElMotivoNoGenera(
  dias: number,
  genera: boolean | undefined,
  motivoNombre: string | undefined
): string | null {
  if (dias > 0 || genera !== false || !motivoNombre) return null
  return `no aplica por el motivo de salida (${motivoNombre})`
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
      liq_neto,
      liq_pagado,
      liq_fecha_pago,
      liq_created_at,
      liq_salario_diario,
      liq_salario_diario_vacaciones,
      liq_dias_trabajados_mes,
      liq_salario_proporcional,
      liq_aguinaldo_proporcional,
      liq_dias_vacaciones_pendientes,
      liq_vacaciones_pagadas,
      liq_horas_extra_banco,
      liq_dias_preaviso,
      liq_preaviso,
      liq_dias_cesantia,
      liq_cesantia,
      liq_nota_preaviso,
      liq_nota_cesantia,
      liq_dias_indemnizacion_plazo_fijo,
      liq_indemnizacion_plazo_fijo,
      liq_deducciones_obreras,
      liq_observaciones,
      sgrh_pagos_extraordinarios ( pex_id, pex_fecha_pago ),
      sgrh_cat_motivos_salida ( mot_nombre, mot_genera_preaviso, mot_genera_cesantia ),
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
    const pago = row.sgrh_pagos_extraordinarios?.[0] ?? null
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
      // Filas de antes de la migración no tienen neto: se muestra el bruto.
      neto: row.liq_neto ?? row.liq_total,
      // El pago con comprobante es la fuente de verdad; liq_pagado lo
      // acompaña (ver pagarLiquidacion).
      pagado: row.liq_pagado || pago !== null,
      pagoId: pago?.pex_id ?? null,
      fechaPago: pago?.pex_fecha_pago ?? row.liq_fecha_pago,
      createdAt: row.liq_created_at,
      // numeric llega como número desde PostgREST; Number() por si un día
      // llega como texto (numeric grande).
      desglose: {
        salarioDiario: Number(row.liq_salario_diario),
        salarioDiarioVacaciones:
          row.liq_salario_diario_vacaciones === null
            ? null
            : Number(row.liq_salario_diario_vacaciones),
        diasSalarioPendiente: Number(row.liq_dias_trabajados_mes),
        salarioProporcional: Number(row.liq_salario_proporcional),
        aguinaldoProporcional: Number(row.liq_aguinaldo_proporcional),
        diasVacaciones: Number(row.liq_dias_vacaciones_pendientes),
        vacacionesPagadas: Number(row.liq_vacaciones_pagadas),
        horasExtraBanco: Number(row.liq_horas_extra_banco ?? 0),
        diasPreaviso: Number(row.liq_dias_preaviso),
        preaviso: Number(row.liq_preaviso),
        diasCesantia: Number(row.liq_dias_cesantia),
        cesantia: Number(row.liq_cesantia),
        // Las liquidaciones de antes de guardar la nota: si el motivo no
        // genera el rubro, se dice; otro caso no se puede reconstruir.
        notaPreaviso:
          row.liq_nota_preaviso ??
          notaSiElMotivoNoGenera(
            Number(row.liq_dias_preaviso),
            row.sgrh_cat_motivos_salida?.mot_genera_preaviso,
            row.sgrh_cat_motivos_salida?.mot_nombre
          ),
        notaCesantia:
          row.liq_nota_cesantia ??
          notaSiElMotivoNoGenera(
            Number(row.liq_dias_cesantia),
            row.sgrh_cat_motivos_salida?.mot_genera_cesantia,
            row.sgrh_cat_motivos_salida?.mot_nombre
          ),
        diasIndemnizacionPlazoFijo: Number(row.liq_dias_indemnizacion_plazo_fijo ?? 0),
        indemnizacionPlazoFijo: Number(row.liq_indemnizacion_plazo_fijo ?? 0),
        total: Number(row.liq_total),
        deduccionesObreras: Number(row.liq_deducciones_obreras ?? 0),
        neto: Number(row.liq_neto ?? row.liq_total),
        advertencias: (row.liq_observaciones ?? '').split('\n').filter((a) => a.trim()),
      },
    }
  })

  return { ok: true, data: items }
}
