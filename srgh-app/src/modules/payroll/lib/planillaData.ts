// Consultas compartidas entre la descarga de plantilla y la subida de planilla.
// Solo servidor; recibe el cliente Supabase ya creado para facilitar el testeo.

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { FilaGuardadaPlantilla } from './planillaExcel'

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

interface FilaGuardadaRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number | null
  ndt_salario_por_hora: number
}

interface LineaGuardadaRow {
  detalle: number
  monto: number
  sgrh_cat_conceptos_nomina: { con_codigo: string } | null
}

export type FilasGuardadasResult =
  { ok: true; data: Map<number, FilaGuardadaPlantilla> } | { ok: false; error: string }

/**
 * Las filas que ya tiene el periodo, por contrato, con sus montos por código
 * de concepto. La plantilla las usa para no traer en 0 lo que alguien ya
 * escribió (comisiones, préstamos, BASE corregido).
 *
 * Si falla, la descarga se corta: una plantilla con los montos en 0 es
 * justamente lo que borraba lo guardado al subirla.
 */
export async function getFilasGuardadas(
  supabase: SupabaseServerClient,
  periodoId: number
): Promise<FilasGuardadasResult> {
  const fallo = { ok: false as const, error: 'No se pudo leer la planilla guardada del periodo.' }

  const { data: filas, error } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      'ndt_id, ndt_historial_laboral_id, ndt_pagado, ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_salario_por_hora'
    )
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<FilaGuardadaRow[]>()
  if (error) return fallo

  const porLab = new Map<number, FilaGuardadaPlantilla>()
  const porNdt = new Map<number, FilaGuardadaPlantilla>()
  for (const f of Array.isArray(filas) ? filas : []) {
    const fila: FilaGuardadaPlantilla = {
      pagado: f.ndt_pagado,
      horas: f.ndt_horas_ordinarias_diurnas,
      horasExtra: f.ndt_horas_extra_al_50 ?? 0,
      salarioPorHora: f.ndt_salario_por_hora,
      montos: {},
    }
    porLab.set(f.ndt_historial_laboral_id, fila)
    porNdt.set(f.ndt_id, fila)
  }
  if (porNdt.size === 0) return { ok: true, data: porLab }

  const ids = [...porNdt.keys()]
  const [ingresos, deducciones] = await Promise.all([
    supabase
      .from('sgrh_nomina_linea_ingreso')
      .select(
        'detalle:ing_nomina_detalle_id, monto:ing_monto, sgrh_cat_conceptos_nomina ( con_codigo )'
      )
      .in('ing_nomina_detalle_id', ids)
      .returns<LineaGuardadaRow[]>(),
    supabase
      .from('sgrh_nomina_linea_deduccion')
      .select(
        'detalle:ded_nomina_detalle_id, monto:ded_monto, sgrh_cat_conceptos_nomina ( con_codigo )'
      )
      .in('ded_nomina_detalle_id', ids)
      .returns<LineaGuardadaRow[]>(),
  ])
  if (ingresos.error || deducciones.error) return fallo

  for (const linea of [
    ...(Array.isArray(ingresos.data) ? ingresos.data : []),
    ...(Array.isArray(deducciones.data) ? deducciones.data : []),
  ]) {
    const fila = porNdt.get(linea.detalle)
    const codigo = linea.sgrh_cat_conceptos_nomina?.con_codigo
    if (!fila || !codigo) continue
    fila.montos[codigo] = (fila.montos[codigo] ?? 0) + linea.monto
  }
  return { ok: true, data: porLab }
}
