import { round2 } from '@/modules/payroll/lib/numeros'

// Reglas de la planilla. Funciones puras — sin I/O — para poder testearlas
// sin exceljs.
//
// NOTA: antes existía aquí un bloque "legacy" con 5 columnas fijas (BASE,
// FERIADO, COMISION, HORAS_EXTRA, AJUSTE) y un CCSS_RATE quemado en código,
// usado solo por la subida de Excel. Se eliminó porque ignoraba cualquier
// concepto que no fuera esos 5 — si creabas un concepto nuevo en el catálogo
// (un bono, un préstamo...), la subida de Excel simplemente no lo aplicaba.
// Ahora la subida de Excel usa el MISMO motor dinámico de abajo
// (calcularPlanillaPorConceptos) que ya usaba la edición manual: no hay
// conceptos quemados en código, todo sale del catálogo activo.

/** Redondeo a 2 decimales sin sorpresas de coma flotante. */
// ─── Motor de cálculo dinámico por conceptos ─────────────────────────────────
// Usado por la edición manual del detalle de planilla (updateDetalleManual.ts
// / DetalleEditForm.tsx) y por la subida de Excel (uploadPlanilla.ts /
// planillaExcel.ts). No asume qué conceptos existen: recibe la lista de
// conceptos activos del catálogo (con su con_tipo_calculo y con_porcentaje) y
// calcula a partir de eso.

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
  /** 'ingreso' | 'deduccion' | 'patronal'. Ver esConceptoDelTrabajador. */
  con_tipo: string
  con_tipo_calculo: string
  con_porcentaje: number | null
}

/**
 * Un concepto patronal (con_tipo = 'patronal') es costo del patrono ante la
 * CCSS, el INS y demas instituciones: NO es ingreso ni deduccion del
 * trabajador y no puede entrar en el calculo de su planilla.
 *
 * Se filtra por con_tipo y no por con_tipo_calculo porque en el catalogo
 * varios patronales estan guardados como 'monto_manual_ingreso' (todavia no
 * hay motor de cargas patronales, ver el seed 04_nomina.sql). Sin este filtro
 * salian como columnas editables del Excel y, si alguien las llenaba, sumaban
 * al salario bruto del empleado y ademas le aplicaban CCSS obrera encima.
 */
export function esConceptoDelTrabajador(concepto: { con_tipo: string }): boolean {
  return concepto.con_tipo !== 'patronal'
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

  // Las cargas patronales quedan fuera: no son plata del trabajador.
  const aplicables = conceptos.filter(esConceptoDelTrabajador)

  for (const concepto of aplicables) {
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

  for (const concepto of aplicables) {
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

// ─── Excel de planilla: columnas dinámicas por concepto ──────────────────────
// Compartido entre planillaExcel.ts (generar/leer el archivo) y
// uploadPlanilla.ts (guardar lo leído). El Excel muestra una columna editable
// por cada concepto activo de tipo "monto manual" (ingreso o deducción); los
// de "% del bruto" y "horas extra automático" se calculan solos, igual que en
// la edición manual — no son columnas que el usuario llene.

/** Concepto del catálogo con los datos necesarios para armar una columna del Excel. */
export interface ConceptoPlanillaColumna extends ConceptoCalculo {
  con_nombre: string
}

/**
 * Huella del catálogo con el que se generó una plantilla.
 *
 * La plantilla de Excel se arma a partir del catálogo activo: los nombres de
 * los conceptos son los encabezados de las columnas, y sus porcentajes entran
 * en las fórmulas. Si el catálogo cambia después de descargarla, ese archivo
 * ya no corresponde: puede faltarle una columna nueva, o traer un encabezado
 * que ya no existe. Antes eso se leía como "monto 0" sin avisar.
 *
 * Se guarda en una hoja oculta del archivo y se compara al subirlo. Entra
 * todo lo que cambia la forma o el cálculo de la plantilla; el orden no
 * importa porque se ordena por con_id.
 */
export function firmaCatalogo(conceptos: ConceptoPlanillaColumna[]): string {
  const texto = [...conceptos]
    .sort((a, b) => a.con_id - b.con_id)
    .map((c) =>
      [
        c.con_id,
        c.con_codigo,
        c.con_nombre,
        c.con_tipo,
        c.con_tipo_calculo,
        c.con_porcentaje ?? '',
      ].join(':')
    )
    .join('|')

  // FNV-1a de 32 bits: estable entre corridas y entre plataformas, sin
  // dependencias. No es criptográfico y no necesita serlo — solo tiene que
  // cambiar cuando cambia el catálogo.
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Agrupa los conceptos activos por cómo se usan en el Excel (columna editable vs. calculado). */
export function agruparConceptosPlanilla(conceptos: ConceptoPlanillaColumna[]) {
  // Mismo filtro que el motor de calculo: un concepto patronal no es columna
  // de la planilla del trabajador.
  const aplicables = conceptos.filter(esConceptoDelTrabajador)
  return {
    ingresoManual: aplicables.filter((c) => c.con_tipo_calculo === 'monto_manual_ingreso'),
    deduccionManual: aplicables.filter((c) => c.con_tipo_calculo === 'monto_manual_deduccion'),
    horasExtra: aplicables.filter((c) => c.con_tipo_calculo === 'horas_extra_automatico'),
    deduccionPorcentual: aplicables.filter(
      (c) => c.con_tipo_calculo === 'porcentaje_deduccion_bruto'
    ),
  }
}

/** Celda cruda del Excel: número, texto, fórmula ya resuelta o vacío. */
export type RawCell = string | number | null | undefined

export interface PlanillaRowError {
  fila: number
  mensaje: string
}

/** Una fila de la planilla ya normalizada, lista para calcularPlanillaPorConceptos. */
export interface PlanillaRowInput {
  cedula: string
  horasTrabajadas: number
  salarioPorHora: number
  /** Monto por código de concepto — solo conceptos monto_manual_ingreso / monto_manual_deduccion. */
  montos: Record<string, number>
}

export type ParseRowResult =
  { ok: true; row: PlanillaRowInput } | { ok: false; error: PlanillaRowError } | { ok: 'empty' }

function toNumber(value: RawCell): number | null {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[₡,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Valida y normaliza una fila cruda del Excel (índice 1-based para mensajes).
 * `montosCrudos` trae un valor por cada columna de monto manual (código y
 * nombre del concepto, para el mensaje de error). Los campos vacíos cuentan
 * como 0; los negativos o no numéricos se rechazan.
 */
export function parsePlanillaRow(
  fila: number,
  cedula: RawCell,
  horasTrabajadas: RawCell,
  salarioPorHora: RawCell,
  montosCrudos: { codigo: string; etiqueta: string; valor: RawCell }[]
): ParseRowResult {
  const cedulaStr = cedula === null || cedula === undefined ? '' : String(cedula).trim()
  const vacio = (v: RawCell) => v === null || v === undefined || v === ''

  // Fila totalmente vacía: se ignora sin error
  if (
    !cedulaStr &&
    vacio(horasTrabajadas) &&
    vacio(salarioPorHora) &&
    montosCrudos.every((m) => vacio(m.valor))
  ) {
    return { ok: 'empty' }
  }

  if (!cedulaStr) {
    return { ok: false, error: { fila, mensaje: 'Falta la cédula del empleado.' } }
  }

  const horas = toNumber(horasTrabajadas)
  if (horas === null) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "horas trabajadas" no es un número válido.' },
    }
  }
  if (horas < 0) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "horas trabajadas" no puede ser negativo.' },
    }
  }

  const salario = toNumber(salarioPorHora)
  if (salario === null) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "salario por hora" no es un número válido.' },
    }
  }
  if (salario < 0) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "salario por hora" no puede ser negativo.' },
    }
  }

  const montos: Record<string, number> = {}
  for (const { codigo, etiqueta, valor } of montosCrudos) {
    const n = toNumber(valor)
    if (n === null) {
      return {
        ok: false,
        error: { fila, mensaje: `El campo "${etiqueta}" no es un número válido.` },
      }
    }
    if (n < 0) {
      return {
        ok: false,
        error: { fila, mensaje: `El campo "${etiqueta}" no puede ser negativo.` },
      }
    }
    montos[codigo] = n
  }

  return {
    ok: true,
    row: { cedula: cedulaStr, horasTrabajadas: horas, salarioPorHora: salario, montos },
  }
}

/**
 * Compara los valores crudos de una fila (sin la cédula) contra lo ya
 * guardado en el periodo. Se usa para el upsert de la planilla: si todo
 * coincide, la fila del empleado se deja intacta (no se toca ndt_id,
 * ndt_pagado ni fechas).
 */
export function sameRowValues(
  a: Omit<PlanillaRowInput, 'cedula'>,
  b: Omit<PlanillaRowInput, 'cedula'>
): boolean {
  if (a.horasTrabajadas !== b.horasTrabajadas) return false
  if (a.salarioPorHora !== b.salarioPorHora) return false

  const codigos = new Set([...Object.keys(a.montos), ...Object.keys(b.montos)])
  for (const codigo of codigos) {
    if ((a.montos[codigo] ?? 0) !== (b.montos[codigo] ?? 0)) return false
  }
  return true
}
