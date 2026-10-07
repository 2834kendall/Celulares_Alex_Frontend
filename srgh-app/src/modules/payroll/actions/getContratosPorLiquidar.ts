'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { leerPaginado } from '@/modules/payroll/lib/paginado'
import type { ContratoPorLiquidarItem } from '@/modules/payroll/types'

export type GetContratosPorLiquidarResult =
  { ok: true; data: ContratoPorLiquidarItem[] } | { ok: false; error: string }

interface ContratoTerminadoRow {
  lab_id: number
  lab_fecha_inicio: string
  lab_fecha_fin: string
  sgrh_empleados: {
    emp_numero_identificacion: string
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
    /** Los otros contratos del empleado: ver tieneContratoPosterior. */
    sgrh_historial_laboral?: { lab_id: number; lab_fecha_inicio: string }[] | null
  } | null
  sgrh_cat_motivos_salida: {
    mot_codigo: string
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
 * Un contrato cerrado que tiene otro contrato después es un TRASLADO de antes
 * de SGRH-90 (se cerraba uno y se abría otro, sin liquidar): la relación
 * laboral sigue en el contrato nuevo y no hay nada que liquidar. Desde
 * SGRH-90 crear_contrato exige el anterior liquidado, así que un contrato
 * terminado y pendiente es siempre el último del empleado.
 */
function tieneContratoPosterior(row: ContratoTerminadoRow): boolean {
  return (row.sgrh_empleados?.sgrh_historial_laboral ?? []).some(
    (otro) =>
      otro.lab_id !== row.lab_id &&
      (otro.lab_fecha_inicio > row.lab_fecha_inicio ||
        (otro.lab_fecha_inicio === row.lab_fecha_inicio && otro.lab_id > row.lab_id))
  )
}

/**
 * Contratos que RRHH ya terminó desde el perfil del empleado (SGRH-90) y
 * todavía no se liquidaron. Una terminación programada (preaviso) no aparece
 * hasta que llega su último día: lab_fecha_fin sigue en null hasta entonces.
 */
export async function getContratosPorLiquidar(): Promise<GetContratosPorLiquidarResult> {
  await requirePermission(PERMISOS.NOMINA_WRITE)

  const supabase = await createClient()
  // Por páginas: los contratos cerrados se acumulan (los liquidados se
  // descartan recién acá) y PostgREST corta en 1000 filas sin avisar.
  const { data, error } = await leerPaginado<ContratoTerminadoRow>((desde, hasta) =>
    supabase
      .from('sgrh_historial_laboral')
      .select(
        `
        lab_id,
        lab_fecha_inicio,
        lab_fecha_fin,
        sgrh_empleados (
          emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_apellido_2,
          sgrh_historial_laboral ( lab_id, lab_fecha_inicio )
        ),
        sgrh_cat_motivos_salida ( mot_codigo, mot_nombre, mot_genera_cesantia, mot_genera_preaviso, mot_nota_legal ),
        sgrh_liquidaciones ( liq_id )
      `
      )
      .not('lab_fecha_fin', 'is', null)
      .order('lab_id')
      .range(desde, hasta)
      .returns<ContratoTerminadoRow[]>()
  )

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los contratos por liquidar.' }
  }

  const contratos: ContratoPorLiquidarItem[] = (data ?? [])
    .filter(
      (row) =>
        row.sgrh_empleados !== null &&
        !estaLiquidado(row.sgrh_liquidaciones) &&
        !tieneContratoPosterior(row)
    )
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
              codigo: motivo.mot_codigo,
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
