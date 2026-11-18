// Consultas compartidas entre la descarga de plantilla y la subida de planilla.
// Solo servidor; recibe el cliente Supabase ya creado para facilitar el testeo.

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { FilaGuardadaPlantilla } from './planillaExcel'
import { origenHoras } from './horasOrigen'
import { leerFilasEstado } from './filasEstado'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface HistorialActivoRow {
  lab_id: number
  lab_sucursal_id: number
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
  /**
   * Sucursal a la que pertenece su fila en el periodo: la de la fila si ya
   * tiene una, y si no la del contrato hoy (la que la base le va a poner a la
   * fila al crearla).
   */
  sucursalId: number
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
  | {
      ok: true
      data: EmpleadoActivo[]
      /**
       * Solo con `periodoId`: contratos vigentes del alcance que NO van en la
       * lista porque ya tienen fila en el periodo en otra sucursal (ver abajo).
       * Para poder decir por qué una cédula del Excel no se acepta.
       */
      enOtraSucursal?: EmpleadoActivo[]
    }
  | { ok: false; error: string }

const SELECT_CONTRATO_PLANILLA = `
      lab_id,
      lab_sucursal_id,
      lab_salario_base,
      lab_salario_real,
      sgrh_empleados ( emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )
    `

/**
 * Contratos vigentes (sin fecha de fin) de las sucursales pedidas, con la
 * cédula y el nombre del empleado. `sucursalIds` es el alcance de la acción
 * (ver lib/alcancePlanilla.ts): la sucursal del periodo, o las que ve la
 * cuenta en un periodo de toda la empresa. Nota de permisos: RLS de
 * sgrh_historial_laboral exige EMPLEADOS_READ o HISTORIAL_READ además del
 * NOMINA_WRITE de la pantalla, y solo deja ver los contratos de las
 * sucursales de la cuenta.
 *
 * Con `finPeriodo`, deja afuera los contratos que empiezan después de que
 * termina la quincena.
 *
 * Con `periodoId` (plantilla y subida del Excel) la lista pasa a ser "quién
 * va en la planilla de ese periodo dentro del alcance":
 *
 *  - Suma los contratos que YA tienen fila en el periodo en una sucursal del
 *    alcance, aunque hayan terminado o se hayan trasladado después. Sin
 *    ellos, alguien terminado y todavía sin liquidar trababa el Excel de un
 *    periodo vencido: si se lo dejaba fuera, su fila impaga estaba protegida
 *    ("volvé a incluirlo"); si se lo incluía, "cédula sin contrato activo".
 *  - Saca los contratos vigentes que ya tienen fila en el periodo en OTRA
 *    sucursal (un traslado después de pagarle): esa fila es de la otra
 *    sucursal, y un contrato no puede tener dos en el mismo periodo. Se
 *    pregunta con nomina_filas_estado porque esa fila puede ser de una
 *    sucursal que la cuenta no ve.
 *
 * Una misma persona puede salir dos veces (un contrato terminado con fila y
 * su reingreso): son dos contratos, y la plantilla los distingue por el id
 * del contrato.
 */
export async function getEmpleadosActivos(
  supabase: SupabaseServerClient,
  sucursalIds: number[],
  opciones: { periodoId?: number; finPeriodo?: string | null } = {}
): Promise<GetEmpleadosActivosResult> {
  const { periodoId, finPeriodo } = opciones
  const alcance = new Set(sucursalIds)

  // Solo quien ya había ingresado cuando terminó la quincena: antes se cargaba
  // a cualquiera con contrato vigente, y a alguien que entró en mayo se le
  // armaba (y pagaba) la planilla de diciembre anterior.
  const leerVigentes = () => {
    let consulta = supabase
      .from('sgrh_historial_laboral')
      .select(SELECT_CONTRATO_PLANILLA)
      .in('lab_sucursal_id', sucursalIds)
      .is('lab_fecha_fin', null)
    if (finPeriodo) consulta = consulta.lte('lab_fecha_inicio', finPeriodo)
    return consulta.returns<HistorialActivoRow[]>()
  }
  // Los contratos vigentes y las filas del periodo no dependen entre sí: se
  // leen juntos (antes, una consulta detrás de la otra). Los errores se
  // revisan en el mismo orden.
  const [{ data, error }, lecturaPeriodo, lecturaEstado] = await Promise.all([
    alcance.size > 0 ? leerVigentes() : { data: [] as HistorialActivoRow[], error: null },
    periodoId !== undefined
      ? supabase
          .from('sgrh_nomina_detalle')
          .select('ndt_historial_laboral_id, ndt_sucursal_id')
          .eq('ndt_nomina_periodo_id', periodoId)
          .returns<{ ndt_historial_laboral_id: number; ndt_sucursal_id: number }[]>()
      : null,
    periodoId !== undefined ? leerFilasEstado(supabase, periodoId) : null,
  ])

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los empleados activos de la sucursal.' }
  }

  let filas = Array.isArray(data) ? [...data] : []
  let filasEnOtraSucursal: HistorialActivoRow[] = []
  /** Sucursal de la fila que el contrato ya tiene en el periodo, dentro del alcance. */
  const sucursalDeLaFila = new Map<number, number>()

  if (lecturaPeriodo && lecturaEstado) {
    const falloPeriodo = {
      ok: false as const,
      error: 'No se pudieron cargar los empleados de la planilla del periodo.',
    }
    const { data: enPeriodo, error: errPeriodo } = lecturaPeriodo
    if (errPeriodo || !lecturaEstado.ok) return falloPeriodo

    for (const f of Array.isArray(enPeriodo) ? enPeriodo : []) {
      if (alcance.has(f.ndt_sucursal_id)) {
        sucursalDeLaFila.set(f.ndt_historial_laboral_id, f.ndt_sucursal_id)
      }
    }
    // Con fila en el periodo fuera del alcance (otra sucursal, la vea o no la
    // cuenta): no va en esta planilla.
    const conFilaEnElPeriodo = new Set(lecturaEstado.data.map((f) => f.ndt_historial_laboral_id))
    const vaEnEstaPlanilla = (r: HistorialActivoRow) =>
      sucursalDeLaFila.has(r.lab_id) || !conFilaEnElPeriodo.has(r.lab_id)
    filasEnOtraSucursal = filas.filter((r) => !vaEnEstaPlanilla(r))
    filas = filas.filter(vaEnEstaPlanilla)

    const vigentes = new Set(filas.map((r) => r.lab_id))
    const conFilaSinContratoVigente = [...sucursalDeLaFila.keys()].filter((id) => !vigentes.has(id))
    if (conFilaSinContratoVigente.length > 0) {
      const { data: extra, error: errExtra } = await supabase
        .from('sgrh_historial_laboral')
        .select(SELECT_CONTRATO_PLANILLA)
        .in('lab_id', conFilaSinContratoVigente)
        .returns<HistorialActivoRow[]>()
      if (errExtra) return falloPeriodo
      filas.push(...(Array.isArray(extra) ? extra : []))
    }
  }

  const aEmpleado = (row: HistorialActivoRow): EmpleadoActivo => ({
    labId: row.lab_id,
    cedula: row.sgrh_empleados!.emp_numero_identificacion,
    nombre: [
      row.sgrh_empleados!.emp_nombre,
      row.sgrh_empleados!.emp_apellido_1,
      row.sgrh_empleados!.emp_apellido_2,
    ]
      .filter(Boolean)
      .join(' '),
    sucursalId: sucursalDeLaFila.get(row.lab_id) ?? row.lab_sucursal_id,
    salarioBaseMensual: row.lab_salario_base,
    salarioRealMensual: row.lab_salario_real ?? null,
    horasSemanales: row.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null,
  })
  const conEmpleado = (row: HistorialActivoRow) => row.sgrh_empleados !== null

  return {
    ok: true,
    data: filas.filter(conEmpleado).map(aEmpleado),
    ...(periodoId !== undefined
      ? { enOtraSucursal: filasEnOtraSucursal.filter(conEmpleado).map(aEmpleado) }
      : {}),
  }
}

interface FilaGuardadaRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number | null
  ndt_salario_por_hora: number
  ndt_horas_asistencia?: number | null
  ndt_horas_extra_asistencia?: number | null
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
      'ndt_id, ndt_historial_laboral_id, ndt_pagado, ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_salario_por_hora, ndt_horas_asistencia, ndt_horas_extra_asistencia'
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
      horasAjustadas:
        origenHoras(
          { horas: f.ndt_horas_ordinarias_diurnas, horasExtra: f.ndt_horas_extra_al_50 ?? 0 },
          {
            horas: f.ndt_horas_asistencia ?? null,
            horasExtra: f.ndt_horas_extra_asistencia ?? null,
          }
        ) === 'ajustadas',
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
