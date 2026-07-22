'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { anioCicloAguinaldo } from '@/modules/payroll/lib/liquidacion'
import type { AguinaldoItem } from '@/modules/payroll/types'

interface HistorialActivoRow {
  lab_id: number
  sgrh_empleados: {
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
    emp_numero_identificacion: string
  } | null
}

interface ProvisionRow {
  pra_historial_laboral_id: number
  pra_monto_acumulado_aguinaldo: number
  pra_aguinaldo_pagado: boolean
  pra_fecha_pago_aguinaldo: string | null
}

export type GetProvisionesAguinaldoResult =
  { ok: true; data: { anio: number; items: AguinaldoItem[] } } | { ok: false; error: string }

/**
 * Aguinaldo del ciclo actual (diciembre-noviembre) para todos los empleados
 * activos. El monto viene de sgrh_provisiones_anuales, que se va acumulando
 * automáticamente cada vez que se marca un pago de nómina como pagado (ver
 * marcarDetallePagado.ts) — si un empleado activo no tiene pagos marcados
 * todavía en el ciclo, aparece con monto ₡0, no desaparece de la lista.
 */
export async function getProvisionesAguinaldo(): Promise<GetProvisionesAguinaldoResult> {
  await requirePermission(PERMISOS.NOMINA_READ)

  const supabase = await createClient()
  const hoy = new Date()
  const anio = anioCicloAguinaldo(hoy.getMonth() + 1, hoy.getFullYear())

  const { data: activos, error: errActivos } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion )
    `
    )
    .is('lab_fecha_fin', null)
    .returns<HistorialActivoRow[]>()

  if (errActivos) {
    return { ok: false, error: 'No se pudieron cargar los empleados activos.' }
  }

  const idsActivos = (activos ?? []).map((a) => a.lab_id)
  const provisionesPorId = new Map<number, ProvisionRow>()

  if (idsActivos.length > 0) {
    const { data: provisiones, error: errProvisiones } = await supabase
      .from('sgrh_provisiones_anuales')
      .select(
        'pra_historial_laboral_id, pra_monto_acumulado_aguinaldo, pra_aguinaldo_pagado, pra_fecha_pago_aguinaldo'
      )
      .eq('pra_anio', anio)
      .in('pra_historial_laboral_id', idsActivos)
      .returns<ProvisionRow[]>()

    if (errProvisiones) {
      return { ok: false, error: 'No se pudo cargar la provisión de aguinaldo.' }
    }

    for (const p of provisiones ?? []) {
      provisionesPorId.set(p.pra_historial_laboral_id, p)
    }
  }

  const items: AguinaldoItem[] = (activos ?? [])
    .filter((row) => row.sgrh_empleados !== null)
    .map((row) => {
      const provision = provisionesPorId.get(row.lab_id)
      return {
        historialLaboralId: row.lab_id,
        empleadoNombre: [
          row.sgrh_empleados!.emp_nombre,
          row.sgrh_empleados!.emp_apellido_1,
          row.sgrh_empleados!.emp_apellido_2,
        ]
          .filter(Boolean)
          .join(' '),
        empleadoCedula: row.sgrh_empleados!.emp_numero_identificacion,
        anio,
        montoAcumulado: provision?.pra_monto_acumulado_aguinaldo ?? 0,
        pagado: provision?.pra_aguinaldo_pagado ?? false,
        fechaPago: provision?.pra_fecha_pago_aguinaldo ?? null,
      }
    })
    .sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre))

  return { ok: true, data: { anio, items } }
}
