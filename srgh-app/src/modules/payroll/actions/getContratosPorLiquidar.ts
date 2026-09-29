'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { ContratoPorLiquidarItem } from '@/modules/payroll/types'

export type GetContratosPorLiquidarResult =
  { ok: true; data: ContratoPorLiquidarItem[] } | { ok: false; error: string }

interface ContratoTerminadoRow {
  lab_id: number
  lab_fecha_fin: string
  sgrh_empleados: {
    emp_numero_identificacion: string
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
  } | null
  sgrh_cat_motivos_salida: {
    mot_nombre: string
    mot_genera_cesantia: boolean
    mot_genera_preaviso: boolean
    mot_nota_legal: string | null
  } | null
  // liq_historial_laboral_id es UNIQUE: PostgREST puede devolver objeto o
  // arreglo (ver lib/derechosData.ts).
  sgrh_liquidaciones: { liq_id: number } | { liq_id: number }[] | null
}

function estaLiquidado(liq: ContratoTerminadoRow['sgrh_liquidaciones']): boolean {
  return Array.isArray(liq) ? liq.length > 0 : Boolean(liq)
}

/**
 * Contratos que RRHH ya terminó desde el perfil del empleado (SGRH-90) y
 * todavía no se liquidaron. Una terminación programada (preaviso) no aparece
 * hasta que llega su último día: lab_fecha_fin sigue en null hasta entonces.
 */
export async function getContratosPorLiquidar(): Promise<GetContratosPorLiquidarResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_fecha_fin,
      sgrh_empleados ( emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_motivos_salida ( mot_nombre, mot_genera_cesantia, mot_genera_preaviso, mot_nota_legal ),
      sgrh_liquidaciones ( liq_id )
    `
    )
    .not('lab_fecha_fin', 'is', null)
    .returns<ContratoTerminadoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los contratos por liquidar.' }
  }

  const contratos: ContratoPorLiquidarItem[] = (data ?? [])
    .filter((row) => row.sgrh_empleados !== null && !estaLiquidado(row.sgrh_liquidaciones))
    .map((row) => {
      const empleado = row.sgrh_empleados!
      const motivo = row.sgrh_cat_motivos_salida
      return {
        historialLaboralId: row.lab_id,
        cedula: empleado.emp_numero_identificacion,
        nombre: [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
          .filter(Boolean)
          .join(' '),
        fechaSalida: row.lab_fecha_fin,
        motivo: motivo
          ? {
              nombre: motivo.mot_nombre,
              generaCesantia: motivo.mot_genera_cesantia,
              generaPreaviso: motivo.mot_genera_preaviso,
              notaLegal: motivo.mot_nota_legal,
            }
          : null,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return { ok: true, data: contratos }
}
