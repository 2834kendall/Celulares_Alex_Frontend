/**
 * Aguinaldo de un ciclo para cada persona a la que se le debe: lo que
 * muestra la pestaña Aguinaldo y lo que paga pagarAguinaldo salen de esta
 * misma función, así lo que se ve es lo que se paga.
 *
 * A quién se le debe el aguinaldo del ciclo N (1 dic N−1 → 30 nov N):
 *  - A quien sigue trabajando.
 *  - A quien salió DESPUÉS de que el ciclo cerró (del 1 de diciembre de N en
 *    adelante): su liquidación solo cubre el ciclo siguiente, y el cerrado se
 *    le debe completo. Antes esa persona desaparecía de la lista y el
 *    aguinaldo cerrado no se pagaba por ningún lado.
 *  - A quien salió ANTES del cierre, no: su liquidación ya le pagó la parte
 *    proporcional.
 *
 * Una fila por relación laboral (ver contratosDeLaRelacion): un traslado en
 * medio del ciclo no parte el aguinaldo en dos.
 *
 * El monto se calcula desde las quincenas PAGADAS, no desde la provisión
 * acumulada (sgrh_provisiones_anuales): la provisión no ve la licencia de
 * maternidad y se desfasa si alguna vez falló. Es la misma decisión que ya
 * tomaba la liquidación.
 *
 * Solo servidor.
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import {
  aguinaldoDelCiclo,
  completarQuincenasDeLicencia,
  computarQuincenas,
  contratosDeLaRelacion,
  inicioDeLaRelacion,
  type AguinaldoCalculado,
  type ContratoDelEmpleado,
} from './derechos'
import {
  SELECT_CONTRATO,
  aContrato,
  cargarAusencias,
  cargarQuincenas,
  juntarAusencias,
  juntarQuincenas,
  type ContratoRow,
} from './derechosData'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface CandidatoRow {
  lab_id: number
  lab_fecha_inicio: string
  lab_fecha_fin: string | null
  lab_salario_base: number | null
  lab_salario_real: number | null
  sgrh_empleados: {
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
    emp_numero_identificacion: string
    emp_fecha_ingreso_original: string | null
    sgrh_historial_laboral?: ContratoRow[] | null
  } | null
}

export interface AguinaldoDeRelacion {
  /** Contrato al que se le registra el pago: el más reciente de la relación. */
  labId: number
  /** Todos los contratos de la relación. */
  labIds: number[]
  empleadoNombre: string
  empleadoCedula: string
  fechaSalida: string | null
  calculo: AguinaldoCalculado
  /** Ausencias cuyo tipo no se pudo leer (no se sabe si son maternidad). */
  ausenciasSinTipo: number
  pagado: boolean
  fechaPago: string | null
  pagoId: number | null
  montoPagado: number | null
}

export type AguinaldosResult =
  { ok: true; data: AguinaldoDeRelacion[] } | { ok: false; error: string }

/** Primer día después del cierre del ciclo `anio`. */
export function aperturaPagoAguinaldo(anio: number): string {
  return `${anio}-12-01`
}

export async function calcularAguinaldosDelCiclo(
  supabase: SupabaseServerClient,
  anio: number,
  soloLabId?: number
): Promise<AguinaldosResult> {
  let consulta = supabase
    .from('sgrh_historial_laboral')
    .select(
      `lab_id, lab_fecha_inicio, lab_fecha_fin, lab_salario_base, lab_salario_real,
       sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion,
                        emp_fecha_ingreso_original, sgrh_historial_laboral ( ${SELECT_CONTRATO} ) )`
    )
    .or(`lab_fecha_fin.is.null,lab_fecha_fin.gte.${aperturaPagoAguinaldo(anio)}`)
  if (soloLabId !== undefined) consulta = consulta.eq('lab_id', soloLabId)

  const { data: candidatos, error } = await consulta.returns<CandidatoRow[]>()
  if (error) return { ok: false, error: 'No se pudieron cargar los empleados.' }

  // Una fila por relación: la del contrato más reciente.
  interface Fila {
    candidato: CandidatoRow
    contratos: ContratoDelEmpleado[]
    relacion: ContratoDelEmpleado[]
  }
  const porRelacion = new Map<number, Fila>()
  for (const c of candidatos ?? []) {
    if (!c.sgrh_empleados) continue
    const contratos = (c.sgrh_empleados.sgrh_historial_laboral ?? []).map(aContrato)
    if (!contratos.some((x) => x.labId === c.lab_id)) {
      contratos.push(aContrato({ ...c, sgrh_liquidaciones: null }))
    }
    const relacion = contratosDeLaRelacion(c.lab_id, contratos)
    const clave = Math.min(...relacion.map((x) => x.labId))
    const previa = porRelacion.get(clave)
    if (!previa || previa.candidato.lab_fecha_inicio < c.lab_fecha_inicio) {
      porRelacion.set(clave, { candidato: c, contratos, relacion })
    }
  }

  const filas = [...porRelacion.values()]
  const todosLosContratos = filas.flatMap((f) => f.relacion)
  const todosLosIds = [...new Set(todosLosContratos.map((c) => c.labId))]

  const quincenasResult = await cargarQuincenas(supabase, todosLosContratos)
  if (!quincenasResult.ok) return { ok: false, error: quincenasResult.error }
  const ausenciasResult = await cargarAusencias(supabase, todosLosIds)
  if (!ausenciasResult.ok) return { ok: false, error: ausenciasResult.error }

  const pagosPorLab = new Map<
    number,
    { pex_id: number; pex_fecha_pago: string; pex_monto_bruto: number }
  >()
  const provisionPorLab = new Map<
    number,
    { pra_aguinaldo_pagado: boolean; pra_fecha_pago_aguinaldo: string | null }
  >()
  if (todosLosIds.length > 0) {
    const [{ data: pagos, error: errPagos }, { data: provisiones, error: errProv }] =
      await Promise.all([
        supabase
          .from('sgrh_pagos_extraordinarios')
          .select('pex_id, pex_historial_laboral_id, pex_fecha_pago, pex_monto_bruto')
          .eq('pex_tipo', 'aguinaldo')
          .eq('pex_anio_aguinaldo', anio)
          .in('pex_historial_laboral_id', todosLosIds)
          .returns<
            {
              pex_id: number
              pex_historial_laboral_id: number
              pex_fecha_pago: string
              pex_monto_bruto: number
            }[]
          >(),
        supabase
          .from('sgrh_provisiones_anuales')
          .select('pra_historial_laboral_id, pra_aguinaldo_pagado, pra_fecha_pago_aguinaldo')
          .eq('pra_anio', anio)
          .in('pra_historial_laboral_id', todosLosIds)
          .returns<
            {
              pra_historial_laboral_id: number
              pra_aguinaldo_pagado: boolean
              pra_fecha_pago_aguinaldo: string | null
            }[]
          >(),
      ])
    if (errPagos) return { ok: false, error: 'No se pudieron cargar los pagos de aguinaldo.' }
    if (errProv) return { ok: false, error: 'No se pudo cargar la provisión de aguinaldo.' }
    for (const p of pagos ?? []) pagosPorLab.set(p.pex_historial_laboral_id, p)
    for (const p of provisiones ?? []) provisionPorLab.set(p.pra_historial_laboral_id, p)
  }

  const data: AguinaldoDeRelacion[] = []
  for (const { candidato, contratos, relacion } of filas) {
    const emp = candidato.sgrh_empleados!
    const inicioRelacion = inicioDeLaRelacion(
      emp.emp_fecha_ingreso_original,
      candidato.lab_id,
      contratos
    )
    // Quien entró después del 30 de noviembre no tiene nada en este ciclo:
    // listarlo como "no le corresponde" solo ensucia la pestaña.
    if (inicioRelacion > `${anio}-11-30`) continue
    const labIds = relacion.map((c) => c.labId)
    const ausencias = juntarAusencias(ausenciasResult.data, labIds)
    const quincenas = computarQuincenas(
      completarQuincenasDeLicencia(
        juntarQuincenas(quincenasResult.data, labIds),
        ausencias.subsidios,
        relacion
      ),
      ausencias.subsidios
    )
    const calculo = aguinaldoDelCiclo({ quincenas, anio, inicioRelacion })

    const pago = labIds.map((id) => pagosPorLab.get(id)).find(Boolean) ?? null
    const provisionPagada =
      labIds.map((id) => provisionPorLab.get(id)).find((p) => p?.pra_aguinaldo_pagado) ?? null

    data.push({
      labId: candidato.lab_id,
      labIds,
      empleadoNombre: [emp.emp_nombre, emp.emp_apellido_1, emp.emp_apellido_2]
        .filter(Boolean)
        .join(' '),
      empleadoCedula: emp.emp_numero_identificacion,
      fechaSalida: candidato.lab_fecha_fin,
      calculo,
      ausenciasSinTipo: ausencias.sinTipo,
      pagado: pago !== null || provisionPagada !== null,
      fechaPago: pago?.pex_fecha_pago ?? provisionPagada?.pra_fecha_pago_aguinaldo ?? null,
      pagoId: pago?.pex_id ?? null,
      montoPagado: pago ? Number(pago.pex_monto_bruto) : null,
    })
  }

  return { ok: true, data: data.sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre)) }
}
