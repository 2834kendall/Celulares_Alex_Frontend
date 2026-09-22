// Consultas compartidas entre la descarga de plantilla y la subida de planilla.
// Solo servidor; recibe el cliente Supabase ya creado para facilitar el testeo.

import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface HistorialActivoRow {
  lab_id: number
  lab_salario_base: number
  lab_salario_real: number | null
  sgrh_empleados: {
    emp_numero_identificacion: string
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
  } | null
  sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: number | null } | null
}

export interface EmpleadoActivo {
  labId: number
  cedula: string
  nombre: string
  salarioBaseMensual: number
  /** lab_salario_real: el objetivo de la quincena es la mitad (ver prellenadoAsistencia). */
  salarioRealMensual: number | null
  /**
   * Horas semanales de la jornada pactada en el contrato. Es el divisor del
   * valor de la hora (ver lib/jornada.ts): null cuando el contrato no la tiene
   * definida, y ahí se cae a la jornada ordinaria diurna.
   */
  horasSemanales: number | null
}

export type GetEmpleadosActivosResult =
  { ok: true; data: EmpleadoActivo[] } | { ok: false; error: string }

/**
 * Contratos vigentes (sin fecha de fin) de una sucursal, con la cédula y el
 * nombre del empleado. Nota de permisos: RLS de sgrh_historial_laboral exige
 * EMPLEADOS_READ o HISTORIAL_READ además del NOMINA_WRITE de la pantalla.
 */
export async function getEmpleadosActivos(
  supabase: SupabaseServerClient,
  sucursalId: number
): Promise<GetEmpleadosActivosResult> {
  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_salario_base,
      lab_salario_real,
      sgrh_empleados ( emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )
    `
    )
    .eq('lab_sucursal_id', sucursalId)
    .is('lab_fecha_fin', null)
    .returns<HistorialActivoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los empleados activos de la sucursal.' }
  }

  const empleados: EmpleadoActivo[] = (data ?? [])
    .filter((row) => row.sgrh_empleados !== null)
    .map((row) => ({
      labId: row.lab_id,
      cedula: row.sgrh_empleados!.emp_numero_identificacion,
      nombre: [
        row.sgrh_empleados!.emp_nombre,
        row.sgrh_empleados!.emp_apellido_1,
        row.sgrh_empleados!.emp_apellido_2,
      ]
        .filter(Boolean)
        .join(' '),
      salarioBaseMensual: row.lab_salario_base,
      salarioRealMensual: row.lab_salario_real ?? null,
      horasSemanales: row.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null,
    }))

  return { ok: true, data: empleados }
}

/**
 * Igual que getEmpleadosActivos, pero sin filtrar por sucursal: todos los
 * contratos vigentes visibles por RLS (ya scopeados a la empresa del JWT).
 * Se usa para elegir a quién liquidar, donde no tiene sentido limitar a una
 * sola sucursal.
 */
export async function getTodosEmpleadosActivos(
  supabase: SupabaseServerClient
): Promise<GetEmpleadosActivosResult> {
  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_salario_base,
      lab_salario_real,
      sgrh_empleados ( emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )
    `
    )
    .is('lab_fecha_fin', null)
    .returns<HistorialActivoRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los empleados activos.' }
  }

  const empleados: EmpleadoActivo[] = (data ?? [])
    .filter((row) => row.sgrh_empleados !== null)
    .map((row) => ({
      labId: row.lab_id,
      cedula: row.sgrh_empleados!.emp_numero_identificacion,
      nombre: [
        row.sgrh_empleados!.emp_nombre,
        row.sgrh_empleados!.emp_apellido_1,
        row.sgrh_empleados!.emp_apellido_2,
      ]
        .filter(Boolean)
        .join(' '),
      salarioBaseMensual: row.lab_salario_base,
      salarioRealMensual: row.lab_salario_real ?? null,
      horasSemanales: row.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null,
    }))

  return { ok: true, data: empleados }
}
