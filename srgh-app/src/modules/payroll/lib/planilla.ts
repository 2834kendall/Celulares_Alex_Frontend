// Reglas de la planilla importable por Excel (machote del cliente).
// Funciones puras — sin I/O — para poder testearlas sin exceljs.

/** Rebajo obrero CCSS aplicado sobre el bruto (10,83%, tomado del machote). */
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
