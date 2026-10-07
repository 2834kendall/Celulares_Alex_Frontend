/**
 * Lo que la liquidación necesita leer y precalcular antes de armar el
 * finiquito. Lo comparten procesarLiquidacion (que guarda) y
 * proponerVacacionesLiquidacion (que solo propone los días de vacaciones
 * para el formulario): si cada uno leyera por su lado, la propuesta y lo que
 * se guarda podrían no coincidir.
 *
 * Solo servidor; recibe el cliente ya creado para poder testearlo.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { calcularAntiguedad, QUINCENAS_PROMEDIO_LIQUIDACION, type Antiguedad } from './liquidacion'
import {
  QUINCENAS_PROMEDIO_VACACIONES,
  aguinaldoDelCiclo,
  claveDeFecha,
  claveQuincenal,
  completarQuincenasDeLicencia,
  computarQuincenas,
  contratosDeLaRelacion,
  cumpleMesMinimoAguinaldo,
  diaSiguiente,
  diasEnComun,
  diasHabilesEnComun,
  inicioDeLaRelacion,
  promedioDiarioSinSubsidios,
  proponerVacaciones,
  sumarCiclo,
  type ContratoDelEmpleado,
  type PromedioSinSubsidios,
  type QuincenaComputable,
  type VacacionesPropuestas,
} from './derechos'
import {
  ERROR_SUCURSAL_NO_VISIBLE,
  SELECT_CONTRATO,
  aContrato,
  cargarAusencias,
  contratosFueraDeAlcance,
  cargarQuincenas,
  juntarAusencias,
  juntarQuincenas,
  type ContratoRow,
} from './derechosData'
import { anioCicloAguinaldo, quincenaPagadaEnLiquidacion } from './liquidacion'
import { parseFechaLocal } from './fechas'
import { formatCRC } from './format'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface HistorialLiquidacionRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id?: number | null
  lab_fecha_inicio: string
  lab_fecha_fin: string | null
  lab_motivo_salida_id: number | null
  lab_salario_base: number | null
  lab_salario_real: number | null
  sgrh_empleados: {
    emp_fecha_ingreso_original: string | null
    /** Todos los contratos del empleado, para armar la relación laboral. */
    sgrh_historial_laboral?: ContratoRow[] | null
  } | null
  /** La liquidación de ESTE contrato, si ya la tiene. */
  sgrh_liquidaciones: { liq_id: number } | { liq_id: number }[] | null
}

/** Un contrato que ya se puede liquidar: terminado, con su fecha de salida. */
export type HistorialTerminadoRow = HistorialLiquidacionRow & {
  lab_fecha_fin: string
  lab_motivo_salida_id: number
}

export const SELECT_HISTORIAL_LIQUIDACION = `lab_id, lab_empleado_id, lab_sucursal_id, lab_fecha_inicio, lab_fecha_fin, lab_motivo_salida_id,
   lab_salario_base, lab_salario_real,
   sgrh_empleados ( emp_fecha_ingreso_original, sgrh_historial_laboral ( ${SELECT_CONTRATO} ) ),
   sgrh_liquidaciones ( liq_id )`

export type CargarHistorialResult =
  { ok: true; data: HistorialTerminadoRow } | { ok: false; error: string }

/**
 * Lee el contrato a liquidar y verifica que se pueda: que exista, que RRHH ya
 * lo haya terminado desde el perfil del empleado (SGRH-90) y que no esté
 * liquidado. La fecha de salida y el motivo salen de acá, no del formulario:
 * la liquidación no puede contradecir lo que registró RRHH.
 */
export async function cargarHistorialParaLiquidacion(
  supabase: SupabaseServerClient,
  historialLaboralId: number
): Promise<CargarHistorialResult> {
  const { data: historial, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(SELECT_HISTORIAL_LIQUIDACION)
    .eq('lab_id', historialLaboralId)
    .maybeSingle<HistorialLiquidacionRow>()

  if (error) return { ok: false, error: 'No se pudo cargar el historial laboral del empleado.' }
  if (!historial) return { ok: false, error: 'El empleado no existe o no es visible.' }
  if (!historial.lab_fecha_fin) {
    return {
      ok: false,
      error: 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.',
    }
  }
  if (!historial.lab_motivo_salida_id) {
    return { ok: false, error: 'El contrato no tiene motivo de salida registrado.' }
  }
  const liq = historial.sgrh_liquidaciones
  if (Array.isArray(liq) ? liq.length > 0 : Boolean(liq)) {
    return { ok: false, error: 'Este contrato ya fue liquidado.' }
  }
  return {
    ok: true,
    data: {
      ...historial,
      lab_fecha_fin: historial.lab_fecha_fin,
      lab_motivo_salida_id: historial.lab_motivo_salida_id,
    },
  }
}

export interface BasesLiquidacion {
  /** Fecha desde la que se mide la antigüedad (cesantía y preaviso). */
  fechaIngreso: string
  ingresoOriginal: string | null
  /** Inicio de esta relación laboral (aguinaldo mínimo y vacaciones). */
  inicioRelacion: string
  antiguedad: Antiguedad
  salarioContrato: number
  quincenas: QuincenaComputable[]
  claveSalida: number
  promedio: PromedioSinSubsidios
  promedioVacaciones: PromedioSinSubsidios
  /** Salario computable del ciclo de aguinaldo hasta la salida (sin el pendiente). */
  sumaCicloAguinaldo: number
  aguinaldoAplica: boolean
  diasSalarioPendienteBase: { primeraQuincenaPagada: boolean; quincenaDeSalidaPagada: boolean }
  vacaciones: VacacionesPropuestas
  /** Ciclo de aguinaldo anterior, para avisar si no consta como pagado. */
  cicloAnterior: { anio: number; monto: number; labIds: number[] }
  sinPagar: QuincenaComputable[]
  ausenciasSinTipo: number
}

export type BasesLiquidacionResult =
  { ok: true; data: BasesLiquidacion } | { ok: false; error: string }

/**
 * Lee quincenas y ausencias de TODA la relación laboral (ver
 * contratosDeLaRelacion) y calcula las bases de la liquidación.
 *
 * La fecha de salida es el ÚLTIMO día trabajado: se paga como salario
 * pendiente y cuenta para la antigüedad. Por eso la antigüedad se mide hasta
 * el día siguiente. Medirla hasta el mismo día le quitaba un día a todo el
 * mundo, y en los bordes eso es plata: quien trabajó del 1 de enero al 31 de
 * diciembre tiene un año (19,5 días de cesantía y un mes de preaviso), no
 * once meses y treinta días (14 días y quince de preaviso).
 */
export async function calcularBasesLiquidacion(
  supabase: SupabaseServerClient,
  historial: HistorialLiquidacionRow,
  fechaSalida: string,
  /** sucursalesVisibles(claims): con qué sucursales puede leer el usuario. */
  visibles: number[] | null
): Promise<BasesLiquidacionResult> {
  const ingresoOriginal = historial.sgrh_empleados?.emp_fecha_ingreso_original ?? null
  const fechaIngreso = ingresoOriginal ?? historial.lab_fecha_inicio

  const filasContrato = historial.sgrh_empleados?.sgrh_historial_laboral ?? []
  const contratos: ContratoDelEmpleado[] = filasContrato.map(aContrato)
  if (!contratos.some((c) => c.labId === historial.lab_id)) {
    contratos.push(
      aContrato({
        lab_id: historial.lab_id,
        lab_sucursal_id: historial.lab_sucursal_id,
        lab_fecha_inicio: historial.lab_fecha_inicio,
        lab_fecha_fin: historial.lab_fecha_fin,
        lab_salario_base: historial.lab_salario_base,
        lab_salario_real: historial.lab_salario_real,
        sgrh_liquidaciones: null,
      })
    )
  }
  const relacion = contratosDeLaRelacion(historial.lab_id, contratos)
  if (contratosFueraDeAlcance(relacion, visibles)) {
    return { ok: false, error: ERROR_SUCURSAL_NO_VISIBLE }
  }
  const labIds = relacion.map((c) => c.labId)
  const inicioRelacion = inicioDeLaRelacion(ingresoOriginal, historial.lab_id, contratos)

  const quincenasResult = await cargarQuincenas(supabase, relacion)
  if (!quincenasResult.ok) return { ok: false, error: quincenasResult.error }
  const ausenciasResult = await cargarAusencias(supabase, labIds)
  if (!ausenciasResult.ok) return { ok: false, error: ausenciasResult.error }

  const ausencias = juntarAusencias(ausenciasResult.data, labIds)
  const quincenas = computarQuincenas(
    completarQuincenasDeLicencia(
      juntarQuincenas(quincenasResult.data, labIds),
      ausencias.subsidios,
      relacion
    ),
    ausencias.subsidios
  )

  const claveSalida = claveDeFecha(fechaSalida)
  const [anioSalida, mesSalida] = fechaSalida.split('-').map(Number)

  // Para el salario del contrato: lo que la planilla paga es lab_salario_base;
  // lab_salario_real solo cuando el base no está.
  const salarioContrato =
    (historial.lab_salario_base ?? 0) > 0
      ? historial.lab_salario_base!
      : (historial.lab_salario_real ?? 0)

  const promedio = promedioDiarioSinSubsidios(
    quincenas,
    claveSalida,
    QUINCENAS_PROMEDIO_LIQUIDACION,
    salarioContrato
  )
  const promedioVacaciones = promedioDiarioSinSubsidios(
    quincenas,
    claveSalida,
    QUINCENAS_PROMEDIO_VACACIONES,
    salarioContrato
  )

  const cicloAnio = anioCicloAguinaldo(mesSalida, anioSalida)
  const ciclo = sumarCiclo(quincenas, claveQuincenal(cicloAnio - 1, 12, 1), claveSalida)
  const aguinaldoAplica =
    inicioRelacion !== '' && cumpleMesMinimoAguinaldo(inicioRelacion, fechaSalida)

  const anterior = aguinaldoDelCiclo({ quincenas, anio: cicloAnio - 1, inicioRelacion })

  const clavePrimera = claveQuincenal(anioSalida, mesSalida, 1)
  const pagadas = quincenas.filter((q) => q.pagado)

  // Días de incapacidad (no maternidad) y de vacaciones tomadas, dentro de la relación.
  const diasIncapacidad = ausencias.subsidios
    .filter((s) => !s.esMaternidad)
    .reduce(
      (acc, s) => acc + diasEnComun(s.fechaInicio, s.fechaFin, inicioRelacion, fechaSalida),
      0
    )
  const diasTomados = ausencias.vacaciones.reduce(
    (acc, v) => acc + diasHabilesEnComun(v.fechaInicio, v.fechaFin, inicioRelacion, fechaSalida),
    0
  )

  return {
    ok: true,
    data: {
      fechaIngreso,
      ingresoOriginal,
      inicioRelacion,
      antiguedad: calcularAntiguedad(
        parseFechaLocal(fechaIngreso),
        parseFechaLocal(diaSiguiente(fechaSalida))
      ),
      salarioContrato,
      quincenas,
      claveSalida,
      promedio,
      promedioVacaciones,
      sumaCicloAguinaldo: ciclo.suma,
      aguinaldoAplica,
      diasSalarioPendienteBase: {
        primeraQuincenaPagada: pagadas.some((q) => q.clave === clavePrimera),
        quincenaDeSalidaPagada: pagadas.some((q) => q.clave === claveSalida),
      },
      vacaciones: proponerVacaciones({
        ingreso: inicioRelacion,
        ultimoDia: fechaSalida,
        diasIncapacidad,
        diasTomados,
      }),
      cicloAnterior: { anio: cicloAnio - 1, monto: anterior.monto, labIds },
      sinPagar: quincenas
        .filter((q) => !q.pagado && q.clave <= claveSalida)
        .sort((a, b) => a.clave - b.clave),
      ausenciasSinTipo: ausencias.sinTipo,
    },
  }
}

/**
 * ¿El aguinaldo del ciclo anterior consta como pagado? Se mira la provisión
 * (lo que marcaba el botón viejo) y los pagos con comprobante. Si ninguno lo
 * dice, se devuelve el aviso para la liquidación.
 *
 * No se suma solo al finiquito: si se pagó fuera del sistema, sumarlo lo
 * pagaría dos veces, y una liquidación guardada no se puede corregir. Se
 * avisa con el monto y se paga desde la pestaña Aguinaldo.
 */
export async function avisoAguinaldoAnterior(
  supabase: SupabaseServerClient,
  cicloAnterior: { anio: number; monto: number; labIds: number[] }
): Promise<string | null> {
  if (cicloAnterior.monto <= 0 || cicloAnterior.labIds.length === 0) return null

  const [{ data: provisiones, error: errProv }, { data: pagos, error: errPagos }] =
    await Promise.all([
      supabase
        .from('sgrh_provisiones_anuales')
        .select('pra_historial_laboral_id, pra_aguinaldo_pagado')
        .in('pra_historial_laboral_id', cicloAnterior.labIds)
        .eq('pra_anio', cicloAnterior.anio)
        .returns<{ pra_historial_laboral_id: number; pra_aguinaldo_pagado: boolean }[]>(),
      supabase
        .from('sgrh_pagos_extraordinarios')
        .select('pex_id')
        .in('pex_historial_laboral_id', cicloAnterior.labIds)
        .eq('pex_tipo', 'aguinaldo')
        .eq('pex_anio_aguinaldo', cicloAnterior.anio)
        .returns<{ pex_id: number }[]>(),
    ])

  if (errProv || errPagos) {
    return `No se pudo verificar si el aguinaldo del ciclo ${cicloAnterior.anio} ya se pagó. Revisalo en la pestaña Aguinaldo antes de entregar el finiquito.`
  }
  const pagado = (pagos ?? []).length > 0 || (provisiones ?? []).some((p) => p.pra_aguinaldo_pagado)
  if (pagado) return null

  return `El aguinaldo del ciclo ${cicloAnterior.anio} (${formatCRC(cicloAnterior.monto)}) no consta como pagado y NO está incluido en esta liquidación. Si no se le ha pagado, pagalo desde la pestaña Aguinaldo; si se pagó fuera del sistema, ignorá este aviso.`
}

/** Liquidación que ya pagó una quincena como salario pendiente. */
export interface LiquidacionQueCubre {
  liqId: number
  fechaSalida: string
  diasSalarioPendiente: number
}

interface LiquidacionCubreRow {
  liq_id: number
  liq_historial_laboral_id: number
  liq_fecha_salida: string
  liq_dias_trabajados_mes: number
  sgrh_historial_laboral?: { lab_empleado_id: number } | null
}

const SELECT_LIQUIDACION_CUBRE =
  'liq_id, liq_historial_laboral_id, liq_fecha_salida, liq_dias_trabajados_mes, sgrh_historial_laboral!inner ( lab_empleado_id )'

/**
 * Para cada contrato, la liquidación que ya le pagó `quincena` como salario
 * pendiente (ver quincenaPagadaEnLiquidacion). Lo usan marcarDetallePagado,
 * para no pagarla otra vez por planilla, y uploadPlanilla, para dejar sacar
 * esa fila de un periodo vencido.
 *
 * Se busca por el contrato y también por el EMPLEADO: si hubo un traslado en
 * el mes de salida, la quincena impaga del contrato anterior la pagó la
 * liquidación del nuevo (el salario pendiente se calcula con toda la
 * relación). Un contrato que empezó después de la salida (reingreso) no
 * cuenta.
 */
export async function liquidacionesQueCubren(
  supabase: SupabaseServerClient,
  labIds: number[],
  quincena: { anio: number; mes: number; quincena: number }
): Promise<{ ok: true; data: Map<number, LiquidacionQueCubre> } | { ok: false }> {
  const cubre = new Map<number, LiquidacionQueCubre>()
  if (labIds.length === 0) return { ok: true, data: cubre }

  const { data: contratos, error: errContratos } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_id, lab_empleado_id, lab_fecha_inicio')
    .in('lab_id', labIds)
    .returns<{ lab_id: number; lab_empleado_id: number; lab_fecha_inicio: string }[]>()
  if (errContratos) return { ok: false }
  const filas = Array.isArray(contratos) ? contratos : []
  const empleados = [...new Set(filas.map((c) => c.lab_empleado_id))]

  const [directas, delEmpleado] = await Promise.all([
    supabase
      .from('sgrh_liquidaciones')
      .select(SELECT_LIQUIDACION_CUBRE)
      .in('liq_historial_laboral_id', labIds)
      .returns<LiquidacionCubreRow[]>(),
    empleados.length > 0
      ? supabase
          .from('sgrh_liquidaciones')
          .select(SELECT_LIQUIDACION_CUBRE)
          .in('sgrh_historial_laboral.lab_empleado_id', empleados)
          .returns<LiquidacionCubreRow[]>()
      : Promise.resolve({ data: [] as LiquidacionCubreRow[], error: null }),
  ])
  if (directas.error || delEmpleado.error) return { ok: false }

  const liquidaciones = [
    ...(Array.isArray(directas.data) ? directas.data : []),
    ...(Array.isArray(delEmpleado.data) ? delEmpleado.data : []),
  ].filter((l) =>
    quincenaPagadaEnLiquidacion(
      { fechaSalida: l.liq_fecha_salida, diasSalarioPendiente: l.liq_dias_trabajados_mes },
      quincena
    )
  )

  const aCubre = (l: LiquidacionCubreRow): LiquidacionQueCubre => ({
    liqId: l.liq_id,
    fechaSalida: l.liq_fecha_salida,
    diasSalarioPendiente: l.liq_dias_trabajados_mes,
  })
  for (const labId of labIds) {
    const propia = liquidaciones.find((l) => l.liq_historial_laboral_id === labId)
    if (propia) {
      cubre.set(labId, aCubre(propia))
      continue
    }
    const contrato = filas.find((c) => c.lab_id === labId)
    if (!contrato) continue
    const deLaRelacion = liquidaciones.find(
      (l) =>
        l.sgrh_historial_laboral?.lab_empleado_id === contrato.lab_empleado_id &&
        contrato.lab_fecha_inicio <= l.liq_fecha_salida
    )
    if (deLaRelacion) cubre.set(labId, aCubre(deLaRelacion))
  }
  return { ok: true, data: cubre }
}
