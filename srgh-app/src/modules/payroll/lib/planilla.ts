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
 * Jornada quincenal supuesta cuando NO hay de dónde sacar la real.
 *
 * Ya no es la regla de las horas extra. Estas se calculan día por día contra
 * el horario programado de cada persona (ver lib/horasPeriodo.ts), que es lo
 * que hace que quien tiene pactada una jornada de 12 h no genere extra por
 * cumplirla, y que quien tiene 8 la genere a la novena. Un tope quincenal
 * plano no puede distinguir esos dos casos.
 *
 * Sobrevive solo como valor por defecto de la plantilla de Excel cuando el
 * periodo no tiene fechas o no se pudieron leer las marcas: 8 h/día × 11 días
 * hábiles aprox. de una quincena costarricense.
 */
export const TOPE_HORAS_NORMALES_QUINCENAL = 88

export interface ConceptoCalculo {
  con_id: number
  con_codigo: string
  /** 'ingreso' | 'deduccion' | 'patronal'. Ver esConceptoDelTrabajador. */
  con_tipo: string
  /**
   * false = el monto se paga pero NO es salario: queda fuera del salario
   * bruto y se suma DESPUÉS de las deducciones (viáticos, que son reintegro
   * de gastos; el aguinaldo pagado por planilla).
   *
   * Que quede fuera del bruto es lo que impide que infle el aguinaldo y la
   * cesantía, porque las dos se calculan sobre ndt_salario_bruto.
   */
  con_afecta_salario_bruto: boolean
  /**
   * false = el monto no entra en la base de las deducciones porcentuales
   * (ej. la CCSS obrera del 10,83%).
   *
   * Solo se mira para lo que SÍ es salario: algo puede ser salario y no
   * cotizar, pero lo que no es salario nunca cotiza.
   */
  con_afecta_base_ccss: boolean
  con_tipo_calculo: string
  con_porcentaje: number | null
  /**
   * true = la deducción es salario que no se ganó (ausencia sin goce): baja
   * el salario bruto en vez de restarse del neto, así que también baja la
   * CCSS y el aguinaldo (auditoría 2, hallazgo 6). Solo tiene efecto en un
   * concepto 'monto_manual_deduccion'. Opcional: si falta, es una deducción
   * normal.
   */
  con_rebaja_salario?: boolean | null
}

/**
 * ¿Esta deducción rebaja el salario (ausencia sin goce) en vez de restarse
 * del neto? Ver ConceptoCalculo.con_rebaja_salario.
 */
export function esRebajoDeSalario(concepto: {
  con_tipo_calculo: string
  con_rebaja_salario?: boolean | null
}): boolean {
  return (
    concepto.con_tipo_calculo === 'monto_manual_deduccion' && concepto.con_rebaja_salario === true
  )
}

/**
 * Un concepto patronal (con_tipo = 'patronal') es costo del patrono ante la
 * CCSS, el INS y demas instituciones: NO es ingreso ni deduccion del
 * trabajador y no puede entrar en el calculo de su planilla.
 *
 * Se filtra por con_tipo y no por con_tipo_calculo porque en el catalogo
 * varios patronales siguen guardados como 'monto_manual_ingreso'. Sin este
 * filtro salian como columnas editables del Excel y, si alguien las llenaba,
 * sumaban al salario bruto del empleado y ademas le aplicaban CCSS obrera
 * encima.
 */
export function esConceptoDelTrabajador(concepto: { con_tipo: string }): boolean {
  return concepto.con_tipo !== 'patronal'
}

/**
 * Código del concepto con el que se paga el salario de la quincena.
 *
 * Es el ÚNICO código que el sistema conoce de memoria. Todo lo que arma una
 * planilla —el prellenado desde asistencia, la plantilla de Excel— escribe el
 * salario ya prorrateado en `montos.BASE` y deja que el motor lo recoja desde
 * el catálogo.
 *
 * Y si el catálogo no tiene ese concepto como ingreso activo del trabajador,
 * nadie lo recoge: el motor recorre los conceptos, ninguno se llama BASE, el
 * monto queda huérfano y la fila sale en ₡0 CON las horas correctas. Es un
 * cero que no se distingue de "no trabajó", y llegó a producción: 9 h
 * trabajadas, 3 extra, total a pagar ₡0.
 *
 * De ahí las dos defensas: el catálogo no deja desactivarlo, renombrarlo ni
 * sacarlo del salario bruto (ver updateConcepto/deleteConcepto), y todo lo que
 * escribe planilla lo verifica antes de guardar en vez de escribir el cero.
 */
export const CODIGO_SALARIO_BASE = 'BASE'

/**
 * Código del concepto con el que se paga el ajuste entre el salario base de
 * la quincena y el objetivo (salario real ÷ 2). Lo calcula el sistema en cada
 * fila (ver lib/prellenadoAsistencia.ts): no se digita, ni en el Excel ni en
 * el detalle. Es el único ingreso que puede ser negativo.
 */
export const CODIGO_AJUSTE = 'AJUSTE'

export const ERROR_SIN_CONCEPTO_AJUSTE =
  `El catálogo de nómina no tiene un concepto activo con código ${CODIGO_AJUSTE}, ` +
  'de tipo "ingreso" y cálculo "monto manual". El sistema escribe ahí la diferencia entre el ' +
  'salario base de la quincena y el salario real; sin él, esa diferencia no se pagaría. ' +
  'Arreglalo en Nómina → Conceptos y volvé a intentarlo.'

export const ERROR_CONCEPTO_AJUSTE_PROTEGIDO =
  `"${CODIGO_AJUSTE}" es el concepto con el que el sistema paga la diferencia entre el salario ` +
  'base y el real: escribe el monto en él por código. Podés cambiarle el nombre, pero no ' +
  'desactivarlo, borrarlo, cambiarle el código ni sacarlo del salario bruto.'

export const ERROR_SIN_CONCEPTO_BASE =
  `El catálogo de nómina no tiene un concepto activo con código ${CODIGO_SALARIO_BASE}, ` +
  'de tipo "ingreso" y cálculo "monto manual". Sin él el salario de la quincena no lo ' +
  'recoge ningún concepto y la planilla saldría en ₡0 aunque las horas estén bien. ' +
  'Arreglalo en Nómina → Conceptos y volvé a intentarlo.'

export const ERROR_CONCEPTO_BASE_PROTEGIDO =
  `"${CODIGO_SALARIO_BASE}" es el concepto con el que se paga el salario de la quincena: el ` +
  'sistema escribe el monto en él por código. Podés cambiarle el nombre, pero no desactivarlo, ' +
  'borrarlo, cambiarle el código ni sacarlo del salario bruto — cualquier planilla que se arme ' +
  'después saldría en ₡0 con las horas correctas. Si necesitás otro tipo de ingreso, creá un ' +
  'concepto nuevo.'

/**
 * ¿Está el concepto del salario base, en condiciones de recibir el monto?
 *
 * No alcanza con que exista la fila: tiene que ser del trabajador (un patronal
 * se filtra), de monto manual (un porcentaje no lee `montos`) y contar como
 * salario (si `con_afecta_salario_bruto` es false el monto se paga pero el
 * bruto queda en cero igual).
 */
export function hayConceptoSalarioBase(conceptos: readonly ConceptoCalculo[]): boolean {
  return conceptos.some(
    (c) =>
      c.con_codigo === CODIGO_SALARIO_BASE &&
      esConceptoDelTrabajador(c) &&
      c.con_tipo_calculo === 'monto_manual_ingreso' &&
      c.con_afecta_salario_bruto !== false
  )
}

/** ¿Está el concepto del ajuste automático, en condiciones de recibir el monto? */
export function hayConceptoAjuste(conceptos: readonly ConceptoCalculo[]): boolean {
  return conceptos.some(
    (c) =>
      c.con_codigo === CODIGO_AJUSTE &&
      esConceptoDelTrabajador(c) &&
      c.con_tipo_calculo === 'monto_manual_ingreso' &&
      c.con_afecta_salario_bruto !== false
  )
}

/** Datos que el usuario carga a mano en el detalle de un empleado dentro del periodo. */
export interface DetalleManualInput {
  /** Monto por concepto (con_codigo), solo para tipos monto_manual_ingreso / monto_manual_deduccion. */
  montos: Record<string, number>
  /** Horas trabajadas en la quincena, dentro de la jornada programada. */
  horasTrabajadas: number
  /**
   * Horas por encima de la jornada programada de cada día, ya calculadas
   * (lib/horasPeriodo.ts). Llegan como dato y no se derivan de un tope: solo
   * quien miró el horario de cada día sabe cuáles sobran.
   */
  horasExtra: number
  /** Salario por hora del empleado, usado para calcular horas extra automáticas. */
  salarioPorHora: number
}

export interface LineaCalculada {
  con_id: number
  con_codigo: string
  monto: number
  /** true = se suma (ingreso); false = se resta (deducción). */
  esIngreso: boolean
  /**
   * Deducción que rebaja el salario (ausencia sin goce): ya está restada del
   * bruto, así que NO forma parte del total de deducciones.
   */
  esRebajoSalario?: boolean
  /** Ingreso que no es salario: se suma después de las deducciones (viáticos). */
  esNoSalarial?: boolean
  /** Solo presentes en deducciones tipo porcentaje (para ded_porcentaje_aplicado / ded_base_calculo). */
  porcentajeAplicado?: number
  baseCalculo?: number
}

/**
 * Una carga patronal calculada para un empleado: lo que la EMPRESA paga
 * encima de su salario (CCSS patronal, INS, FODESAF…).
 *
 * Va en su propia lista y no en `lineas` justamente para que no se pueda
 * mezclar por descuido con los ingresos y deducciones del trabajador: no
 * suma al bruto, no resta del neto y no aparece en su comprobante. Se guarda
 * en sgrh_nomina_linea_patronal y su suma en ndt_total_cargas_patronales.
 */
export interface LineaPatronalCalculada {
  con_id: number
  con_codigo: string
  monto: number
  porcentajeAplicado: number
  baseCalculo: number
}

export interface TotalesPorConceptos {
  /** Solo lo que es salario. Base del aguinaldo y de la cesantía. */
  salarioBruto: number
  /**
   * Parte del bruto que sí cotiza (los ingresos salariales con
   * con_afecta_base_ccss). Es la base de las deducciones porcentuales, y
   * coincide con el bruto salvo que haya salario no cotizable.
   */
  baseCcss: number
  /**
   * Lo que se paga pero no es salario (viáticos). Se suma al final, después
   * de las deducciones: no cotiza y no hace aguinaldo.
   */
  totalNoSalarial: number
  totalDeducciones: number
  /** bruto − deducciones + no salarial. Es la plata que recibe la persona. */
  salarioNeto: number
  /**
   * Lo que la EMPRESA paga encima del salario (CCSS patronal y demás). No
   * sale del salario de nadie y no cambia el neto: es el costo real de tener
   * a esa persona en planilla.
   */
  totalCargasPatronales: number
  lineas: LineaCalculada[]
  lineasPatronales: LineaPatronalCalculada[]
}

/**
 * Calcula bruto, deducciones y neto a partir de los conceptos activos del
 * catálogo (en vez de una lista fija de campos).
 *
 * El orden importa y es el del recibo:
 *   salario base + comisión + …
 *   − ausencia sin goce                  → salario bruto (base de CCSS y aguinaldo)
 *   − CCSS obrera, préstamos, …          → total de deducciones
 *   + viáticos                           → salario neto
 *
 * Los viáticos van al final a propósito: son un reintegro de gastos, no
 * salario. Si entraran al bruto pagarían CCSS y además inflarían el
 * aguinaldo, que se acumula como bruto ÷ 12 en cada pago marcado.
 */
export function calcularPlanillaPorConceptos(
  conceptos: ConceptoCalculo[],
  input: DetalleManualInput
): TotalesPorConceptos {
  const lineas: LineaCalculada[] = []
  let bruto = 0
  // Base de las deducciones porcentuales. Se acumula aparte del bruto porque
  // puede haber salario que no cotiza.
  let baseCcss = 0
  // Lo que se paga pero no es salario. Se suma al final, después de las
  // deducciones.
  let noSalarial = 0

  // Las cargas patronales quedan fuera: no son plata del trabajador.
  const aplicables = conceptos.filter(esConceptoDelTrabajador)

  /**
   * Acumula un ingreso en el balde que le toca. En los dos `!== false`: si el
   * dato faltara, el fallo seguro es el comportamiento de siempre (es salario
   * y cotiza), no dejar de cotizar por un campo vacío.
   */
  const sumarIngreso = (concepto: ConceptoCalculo, monto: number) => {
    lineas.push({
      con_id: concepto.con_id,
      con_codigo: concepto.con_codigo,
      monto,
      esIngreso: true,
      esNoSalarial: concepto.con_afecta_salario_bruto === false,
    })

    if (concepto.con_afecta_salario_bruto === false) {
      noSalarial += monto
      return
    }

    bruto += monto
    if (concepto.con_afecta_base_ccss !== false) baseCcss += monto
  }

  for (const concepto of aplicables) {
    if (concepto.con_tipo_calculo === 'monto_manual_ingreso') {
      const monto = round2(input.montos[concepto.con_codigo] ?? 0)
      // El ajuste es el único ingreso que puede ser negativo (ver
      // CODIGO_AJUSTE): descartarlo haría que el mes no sume el salario real.
      const admiteNegativo = concepto.con_codigo === CODIGO_AJUSTE
      if (monto > 0 || (admiteNegativo && monto !== 0)) sumarIngreso(concepto, monto)
    } else if (concepto.con_tipo_calculo === 'horas_extra_automatico') {
      const monto = round2(
        input.horasExtra * input.salarioPorHora * ((concepto.con_porcentaje ?? 0) / 100)
      )
      if (monto > 0) sumarIngreso(concepto, monto)
    }
  }

  // Ausencia sin goce: son días que no se pagan, así que salen del salario
  // (y con eso de la CCSS y del aguinaldo), igual que cuando la ausencia
  // llega por la asistencia. Antes era una deducción más y solo bajaba el
  // neto (auditoría 2, hallazgo 6). No se puede rebajar más salario del que
  // hay: el exceso no se aplica.
  for (const concepto of aplicables) {
    if (!esRebajoDeSalario(concepto)) continue
    const pedido = round2(input.montos[concepto.con_codigo] ?? 0)
    const monto = round2(Math.min(pedido, Math.max(0, bruto)))
    if (!(monto > 0)) continue
    lineas.push({
      con_id: concepto.con_id,
      con_codigo: concepto.con_codigo,
      monto,
      esIngreso: false,
      esRebajoSalario: true,
    })
    bruto = round2(bruto - monto)
    baseCcss = round2(Math.max(0, baseCcss - monto))
  }

  bruto = round2(bruto)
  baseCcss = round2(baseCcss)
  noSalarial = round2(noSalarial)
  let deducciones = 0

  for (const concepto of aplicables) {
    if (esRebajoDeSalario(concepto)) continue
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
      const monto = round2(baseCcss * (porcentaje / 100))
      if (monto > 0) {
        lineas.push({
          con_id: concepto.con_id,
          con_codigo: concepto.con_codigo,
          monto,
          esIngreso: false,
          porcentajeAplicado: porcentaje,
          baseCalculo: baseCcss,
        })
        deducciones += monto
      }
    }
  }

  deducciones = round2(deducciones)
  const neto = round2(bruto - deducciones + noSalarial)

  // Cargas patronales. Se calculan sobre la MISMA base que la cuota obrera:
  // la CCSS cobra las dos partes sobre el salario cotizable, así que un
  // ingreso exento de CCSS lo está para los dos lados.
  //
  // Estas no salen de `aplicables` —ese filtro las excluye a propósito— sino
  // de los conceptos patronales con un porcentaje puesto. Mientras el
  // concepto no tenga porcentaje no calcula nada, que es lo que deja al
  // encargado activar solo las que necesita desde la pantalla de Conceptos.
  const lineasPatronales: LineaPatronalCalculada[] = []
  let cargasPatronales = 0

  for (const concepto of conceptos) {
    if (esConceptoDelTrabajador(concepto)) continue
    if (concepto.con_tipo_calculo !== 'porcentaje_patronal_bruto') continue

    const porcentaje = concepto.con_porcentaje ?? 0
    const monto = round2(baseCcss * (porcentaje / 100))
    if (monto <= 0) continue

    lineasPatronales.push({
      con_id: concepto.con_id,
      con_codigo: concepto.con_codigo,
      monto,
      porcentajeAplicado: porcentaje,
      baseCalculo: baseCcss,
    })
    cargasPatronales += monto
  }

  return {
    salarioBruto: bruto,
    baseCcss,
    totalNoSalarial: noSalarial,
    totalDeducciones: deducciones,
    salarioNeto: neto,
    totalCargasPatronales: round2(cargasPatronales),
    lineas,
    lineasPatronales,
  }
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
        // Las dos banderas deciden en qué lado del recibo cae el monto, así
        // que cambiarlas cambia el cálculo tanto como cambiar un porcentaje.
        // Faltaban acá: una plantilla vieja seguía pasando la validación
        // aunque los viáticos hubieran dejado de ser salario en el medio.
        c.con_afecta_salario_bruto ? 'S' : 'N',
        c.con_afecta_base_ccss ? 'C' : 'N',
        // Solo cuando está: así no cambia la huella de los catálogos que no
        // tienen ningún rebajo de salario.
        ...(esRebajoDeSalario(c) ? ['R'] : []),
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
  horasExtra: number
  salarioPorHora: number
  /** Monto por código de concepto — solo conceptos monto_manual_ingreso / monto_manual_deduccion. */
  montos: Record<string, number>
}

export type ParseRowResult =
  { ok: true; row: PlanillaRowInput } | { ok: false; error: PlanillaRowError } | { ok: 'empty' }

/** Topes del Excel: los mismos que el formulario manual (editarDetalleSchema). */
const HORAS_MAX = 999
const MONTO_MAX = 99_999_999

/**
 * Un número escrito como TEXTO en una celda (las celdas numéricas llegan como
 * number y no pasan por acá). Acepta el formato de Costa Rica y el de Excel en
 * inglés:
 *
 *  - "215000", "8.5", "1234,56"            → sin miles; 1 o 2 decimales
 *  - "215.000", "1.234,56"                  → punto de miles, coma decimal
 *  - "215,000", "1,234.56"                  → coma de miles, punto decimal
 *
 * Antes se borraban las comas y se leía el resto: "215.000" era 215 y
 * "1.234,56" era 1,23456, y ese monto se guardaba como si alguien lo hubiera
 * escrito así. Lo que no calza con ningún formato se rechaza.
 */
function textoANumero(texto: string): number | null {
  const t = texto.replace(/[₡\s]/g, '')
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+[.,]\d{1,2}$/.test(t)) return Number(t.replace(',', '.'))
  // El mismo separador en todos los miles (\2): "1.234,567" no es un número.
  const miles = /^(-?\d{1,3}([.,])\d{3}(?:\2\d{3})*)(?:([.,])(\d{1,2}))?$/.exec(t)
  if (miles) {
    const [, entero, separadorMiles, separadorDecimal, decimales] = miles
    if (separadorDecimal && separadorDecimal === separadorMiles) return null
    const sinMiles = entero.split(separadorMiles).join('')
    return Number(decimales ? `${sinMiles}.${decimales}` : sinMiles)
  }
  return null
}

function toNumber(value: RawCell): number | null {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : textoANumero(String(value))
  return n !== null && Number.isFinite(n) ? n : null
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
  horasExtra: RawCell,
  salarioPorHora: RawCell,
  montosCrudos: { codigo: string; etiqueta: string; valor: RawCell }[]
): ParseRowResult {
  const cedulaStr = cedula === null || cedula === undefined ? '' : String(cedula).trim()
  const vacio = (v: RawCell) => v === null || v === undefined || v === ''

  // Fila totalmente vacía: se ignora sin error
  if (
    !cedulaStr &&
    vacio(horasTrabajadas) &&
    vacio(horasExtra) &&
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
  if (horas > HORAS_MAX) {
    return {
      ok: false,
      error: {
        fila,
        mensaje: `El campo "horas trabajadas" es demasiado alto (máximo ${HORAS_MAX}).`,
      },
    }
  }

  const extra = toNumber(horasExtra)
  if (extra === null) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "horas extra" no es un número válido.' },
    }
  }
  if (extra < 0) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "horas extra" no puede ser negativo.' },
    }
  }
  if (extra > HORAS_MAX) {
    return {
      ok: false,
      error: { fila, mensaje: `El campo "horas extra" es demasiado alto (máximo ${HORAS_MAX}).` },
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
  if (salario > MONTO_MAX) {
    return {
      ok: false,
      error: { fila, mensaje: 'El campo "salario por hora" es demasiado alto.' },
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
    // El ajuste lo recalcula el servidor al subir; en el archivo es solo
    // informativo y puede venir negativo.
    if (n < 0 && codigo !== CODIGO_AJUSTE) {
      return {
        ok: false,
        error: { fila, mensaje: `El campo "${etiqueta}" no puede ser negativo.` },
      }
    }
    if (Math.abs(n) > MONTO_MAX) {
      return {
        ok: false,
        error: { fila, mensaje: `El campo "${etiqueta}" es demasiado alto (máximo ₡99.999.999).` },
      }
    }
    montos[codigo] = n
  }

  return {
    ok: true,
    row: {
      cedula: cedulaStr,
      horasTrabajadas: horas,
      horasExtra: extra,
      salarioPorHora: salario,
      montos,
    },
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
  if (a.horasExtra !== b.horasExtra) return false
  if (a.salarioPorHora !== b.salarioPorHora) return false

  const codigos = new Set([...Object.keys(a.montos), ...Object.keys(b.montos)])
  for (const codigo of codigos) {
    if ((a.montos[codigo] ?? 0) !== (b.montos[codigo] ?? 0)) return false
  }
  return true
}
