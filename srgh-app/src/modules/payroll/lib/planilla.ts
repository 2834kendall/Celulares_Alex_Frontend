// Reglas de la planilla importable por Excel (machote del cliente).
// Funciones puras — sin I/O — para poder testearlas sin exceljs.
//
// NOTA IMPORTANTE: todo este bloque (hasta "Motor de cálculo dinámico...")
// es el camino LEGACY que usa exclusivamente la subida de Excel
// (uploadPlanilla.ts): 5 columnas fijas (BASE, FERIADO, COMISION,
// HORAS_EXTRA, AJUSTE) y un CCSS_RATE fijo en código. La edición manual del
// detalle de planilla (updateDetalleManual.ts) YA NO usa este bloque — usa el
// motor dinámico basado en el catálogo de conceptos, más abajo en este mismo
// archivo. Mientras el Excel siga en este modelo fijo, el % de CCSS que se
// use al subir un Excel es el de aquí (10,83%), no el que se configure en el
// catálogo — si cambias el % de CCSS_OBRERA en "Conceptos de nómina", eso
// solo afecta filas editadas a mano, no las subidas por Excel.

/** Rebajo obrero CCSS aplicado sobre el bruto (10,83%, tomado del machote). Solo usado por el flujo de Excel — ver nota arriba. */
export const CCSS_RATE = 0.1083

/** Códigos del catálogo sgrh_cat_conceptos_nomina que usa la planilla. */
export const CONCEPTOS_PLANILLA = {
  ingresos: ['BASE', 'FERIADO', 'COMISION', 'HORAS_EXTRA', 'AJUSTE'],
  deduccion: 'CCSS_OBRERA',
} as const

/** Columnas de la hoja "Planilla" de la plantilla generada. */
export const PLANILLA_HEADERS = [
  'Cédula',
  'Empleado',
  'Base',
  'Feriado',
  'Comisión por ventas',
  'Horas extra',
  'Ajuste',
  'Total bruto',
  'Rebajo CCSS (10,83%)',
  'Total neto',
] as const

/** Ingresos de un empleado en la quincena, tal como vienen del Excel. */
export interface PlanillaRowInput {
  cedula: string
  base: number
  feriado: number
  comision: number
  horasExtra: number
  ajuste: number
}

export interface PlanillaRowTotales {
  salarioBruto: number
  deduccionCcss: number
  salarioNeto: number
}

/** Redondeo a 2 decimales sin sorpresas de coma flotante. */
function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Totales de la fila, replicando las fórmulas del machote:
 * bruto = suma de ingresos; CCSS = bruto × 10,83%; neto = bruto − CCSS.
 * Siempre se recalculan en el servidor — nunca se confía en el Excel.
 */
export function computeTotales(row: PlanillaRowInput): PlanillaRowTotales {
  const salarioBruto = round2(row.base + row.feriado + row.comision + row.horasExtra + row.ajuste)
  const deduccionCcss = round2(salarioBruto * CCSS_RATE)
  const salarioNeto = round2(salarioBruto - deduccionCcss)
  return { salarioBruto, deduccionCcss, salarioNeto }
}

/** Montos crudos de ingreso indexados por código de concepto (BASE, FERIADO, ...). */
export type MontosPorConcepto = Record<(typeof CONCEPTOS_PLANILLA.ingresos)[number], number>

/** Reordena los campos de una fila al shape indexado por código de concepto. */
export function montosDeFila(row: Omit<PlanillaRowInput, 'cedula'>): MontosPorConcepto {
  return {
    BASE: row.base,
    FERIADO: row.feriado,
    COMISION: row.comision,
    HORAS_EXTRA: row.horasExtra,
    AJUSTE: row.ajuste,
  }
}

export interface LineaIngresoNueva {
  ing_nomina_detalle_id: number
  ing_concepto_id: number
  ing_monto: number
}

export interface DeduccionCcssNueva {
  ded_nomina_detalle_id: number
  ded_concepto_id: number
  ded_porcentaje_aplicado: number
  ded_base_calculo: number
  ded_monto: number
}

/**
 * Ingresos (>0) y la deducción de CCSS para un ndt_id ya existente, listos
 * para insertar. Compartido por la subida de Excel y la edición manual desde
 * el detalle del periodo — misma regla de cálculo en los dos flujos.
 */
export function construirLineas(
  row: Omit<PlanillaRowInput, 'cedula'>,
  ndtId: number,
  conceptoId: Map<string, number>
): { ingresos: LineaIngresoNueva[]; deduccion: DeduccionCcssNueva } {
  const montos = montosDeFila(row)
  const ingresos = CONCEPTOS_PLANILLA.ingresos
    .filter((codigo) => montos[codigo] > 0)
    .map((codigo) => ({
      ing_nomina_detalle_id: ndtId,
      ing_concepto_id: conceptoId.get(codigo)!,
      ing_monto: montos[codigo],
    }))

  const totales = computeTotales({ cedula: '', ...row })
  const deduccion = {
    ded_nomina_detalle_id: ndtId,
    ded_concepto_id: conceptoId.get(CONCEPTOS_PLANILLA.deduccion)!,
    ded_porcentaje_aplicado: CCSS_RATE * 100,
    ded_base_calculo: totales.salarioBruto,
    ded_monto: totales.deduccionCcss,
  }

  return { ingresos, deduccion }
}

/**
 * Compara los montos crudos de una fila (sin la cédula) contra lo ya guardado
 * en el periodo. Se usa para el upsert de la planilla: si todo coincide, la
 * fila del empleado se deja intacta (no se toca ndt_id, ndt_pagado ni fechas).
 */
export function sameRowValues(
  a: Omit<PlanillaRowInput, 'cedula'>,
  b: Omit<PlanillaRowInput, 'cedula'>
): boolean {
  return (
    a.base === b.base &&
    a.feriado === b.feriado &&
    a.comision === b.comision &&
    a.horasExtra === b.horasExtra &&
    a.ajuste === b.ajuste
  )
}

export interface PlanillaRowError {
  fila: number
  mensaje: string
}

export type ParseRowResult =
  { ok: true; row: PlanillaRowInput } | { ok: false; error: PlanillaRowError } | { ok: 'empty' }

/** Celda cruda del Excel: número, texto, fórmula ya resuelta o vacío. */
export type RawCell = string | number | null | undefined

function toNumber(value: RawCell): number | null {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[₡,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Valida y normaliza una fila cruda del Excel (índice 1-based para mensajes).
 * Los montos vacíos cuentan como 0; los negativos o no numéricos se rechazan.
 */
export function parsePlanillaRow(
  fila: number,
  cedula: RawCell,
  montos: {
    base: RawCell
    feriado: RawCell
    comision: RawCell
    horasExtra: RawCell
    ajuste: RawCell
  }
): ParseRowResult {
  const cedulaStr = cedula === null || cedula === undefined ? '' : String(cedula).trim()
  const values = [montos.base, montos.feriado, montos.comision, montos.horasExtra, montos.ajuste]

  // Fila totalmente vacía: se ignora sin error
  if (!cedulaStr && values.every((v) => v === null || v === undefined || v === '')) {
    return { ok: 'empty' }
  }

  if (!cedulaStr) {
    return { ok: false, error: { fila, mensaje: 'Falta la cédula del empleado.' } }
  }

  const parsed = {
    base: toNumber(montos.base),
    feriado: toNumber(montos.feriado),
    comision: toNumber(montos.comision),
    horasExtra: toNumber(montos.horasExtra),
    ajuste: toNumber(montos.ajuste),
  }

  for (const [campo, valor] of Object.entries(parsed)) {
    if (valor === null) {
      return { ok: false, error: { fila, mensaje: `El campo "${campo}" no es un número válido.` } }
    }
    if (valor < 0) {
      return { ok: false, error: { fila, mensaje: `El campo "${campo}" no puede ser negativo.` } }
    }
  }

  return {
    ok: true,
    row: {
      cedula: cedulaStr,
      base: parsed.base!,
      feriado: parsed.feriado!,
      comision: parsed.comision!,
      horasExtra: parsed.horasExtra!,
      ajuste: parsed.ajuste!,
    },
  }
}

// ─── Motor de cálculo dinámico por conceptos ─────────────────────────────────
// Usado por la edición manual del detalle de planilla (updateDetalleManual.ts
// / DetalleEditForm.tsx). A diferencia del bloque de arriba, este NO asume
// qué conceptos existen: recibe la lista de conceptos activos del catálogo
// (con su con_tipo_calculo y con_porcentaje) y calcula a partir de eso.

/**
 * Tope de horas normales quincenales: las horas trabajadas por encima de
 * este número se consideran "horas extra" para los conceptos de tipo
 * horas_extra_automatico. Ajusta este número si la jornada de la empresa es
 * distinta (valor por defecto: 8h/día × 11 días hábiles aprox. en una
 * quincena costarricense estándar).
 */
export const TOPE_HORAS_NORMALES_QUINCENAL = 88

export interface ConceptoCalculo {
  con_id: number
  con_codigo: string
  con_tipo_calculo: string
  con_porcentaje: number | null
}

/** Datos que el usuario carga a mano en el detalle de un empleado dentro del periodo. */
export interface DetalleManualInput {
  /** Monto por concepto (con_codigo), solo para tipos monto_manual_ingreso / monto_manual_deduccion. */
  montos: Record<string, number>
  /** Horas trabajadas en la quincena (mientras no exista marcación automática). */
  horasTrabajadas: number
  /** Salario por hora del empleado, usado para calcular horas extra automáticas. */
  salarioPorHora: number
}

export interface LineaCalculada {
  con_id: number
  con_codigo: string
  monto: number
  /** true = suma al bruto (ingreso); false = se resta (deducción). */
  esIngreso: boolean
  /** Solo presentes en deducciones tipo porcentaje (para ded_porcentaje_aplicado / ded_base_calculo). */
  porcentajeAplicado?: number
  baseCalculo?: number
}

export interface TotalesPorConceptos {
  salarioBruto: number
  totalDeducciones: number
  salarioNeto: number
  lineas: LineaCalculada[]
}

/**
 * Calcula bruto, deducciones y neto a partir de los conceptos activos del
 * catálogo (en vez de una lista fija de campos). Orden: primero se suman los
 * ingresos (manuales + horas extra automáticas) para tener el bruto, y solo
 * entonces se calculan las deducciones porcentuales (que dependen del bruto).
 */
export function calcularPlanillaPorConceptos(
  conceptos: ConceptoCalculo[],
  input: DetalleManualInput
): TotalesPorConceptos {
  const lineas: LineaCalculada[] = []
  let bruto = 0

  for (const concepto of conceptos) {
    if (concepto.con_tipo_calculo === 'monto_manual_ingreso') {
      const monto = round2(input.montos[concepto.con_codigo] ?? 0)
      if (monto > 0) {
        lineas.push({
          con_id: concepto.con_id,
          con_codigo: concepto.con_codigo,
          monto,
          esIngreso: true,
        })
        bruto += monto
      }
    } else if (concepto.con_tipo_calculo === 'horas_extra_automatico') {
      const horasExtra = Math.max(0, input.horasTrabajadas - TOPE_HORAS_NORMALES_QUINCENAL)
      const monto = round2(
        horasExtra * input.salarioPorHora * ((concepto.con_porcentaje ?? 0) / 100)
      )
      if (monto > 0) {
        lineas.push({
          con_id: concepto.con_id,
          con_codigo: concepto.con_codigo,
          monto,
          esIngreso: true,
        })
        bruto += monto
      }
    }
  }

  bruto = round2(bruto)
  let deducciones = 0

  for (const concepto of conceptos) {
    if (concepto.con_tipo_calculo === 'monto_manual_deduccion') {
      const monto = round2(input.montos[concepto.con_codigo] ?? 0)
      if (monto > 0) {
        lineas.push({
          con_id: concepto.con_id,
          con_codigo: concepto.con_codigo,
          monto,
          esIngreso: false,
        })
        deducciones += monto
      }
    } else if (concepto.con_tipo_calculo === 'porcentaje_deduccion_bruto') {
      const porcentaje = concepto.con_porcentaje ?? 0
      const monto = round2(bruto * (porcentaje / 100))
      if (monto > 0) {
        lineas.push({
          con_id: concepto.con_id,
          con_codigo: concepto.con_codigo,
          monto,
          esIngreso: false,
          porcentajeAplicado: porcentaje,
          baseCalculo: bruto,
        })
        deducciones += monto
      }
    }
  }

  deducciones = round2(deducciones)
  const neto = round2(bruto - deducciones)

  return { salarioBruto: bruto, totalDeducciones: deducciones, salarioNeto: neto, lineas }
}
