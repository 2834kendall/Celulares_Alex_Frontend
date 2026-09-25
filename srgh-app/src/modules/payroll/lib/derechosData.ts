/**
 * Lee de Supabase lo que necesitan los cálculos de derechos (derechos.ts):
 * los contratos del empleado, sus quincenas de planilla y sus ausencias
 * aprobadas. El cálculo en sí es puro y vive en derechos.ts.
 *
 * Solo servidor; recibe el cliente ya creado para poder testearlo.
 *
 * Una advertencia que vale para todo este archivo: RLS FILTRA, no falla. Sin
 * permiso de lectura de ausencias, la consulta devuelve una lista vacía y el
 * cálculo parece correcto: el aguinaldo pierde la licencia de maternidad y el
 * promedio de la liquidación se come las incapacidades. Por eso quien llama
 * tiene que verificar el permiso antes (puedeLeerAusencias).
 */

import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { PERMISOS } from '@/lib/permissions/catalog'
import { rangoQuincena } from '@/modules/payroll/lib/fechas'
import { periodoLabel } from '@/modules/payroll/lib/format'
import {
  CODIGO_LICENCIA_MATERNIDAD,
  claveQuincenal,
  type AusenciaSubsidio,
  type ContratoDelEmpleado,
  type QuincenaSalario,
} from '@/modules/payroll/lib/derechos'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Supabase corta cada respuesta en max_rows (1000, supabase/config.toml) SIN
 * avisar: la consulta "funciona" y devuelve las primeras mil filas. Con la
 * planilla de todos los empleados eso se pasa en un par de años, y lo que
 * quedaba afuera eran quincenas pagadas que nunca llegaban al aguinaldo. Se
 * lee por páginas, ordenado por la llave, hasta que una página venga corta.
 */
const PAGINA = 1000

async function leerPaginado<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) return { data: [], error }
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return { data: filas, error: null }
  }
}

/** Mensaje único para cuando el usuario no puede leer ausencias. */
export const ERROR_SIN_PERMISO_AUSENCIAS =
  'Para calcular aguinaldo y liquidación hace falta permiso de lectura de Ausencias (AUSENCIAS_READ): ' +
  'sin él no se ven las incapacidades ni las licencias de maternidad, y el monto saldría mal sin ' +
  'ningún aviso. Pedile a un administrador que agregue ese permiso a tu rol.'

/** ¿El JWT trae permiso de lectura de ausencias? */
export function puedeLeerAusencias(claims: { app_metadata?: unknown }): boolean {
  const permisos = ((claims.app_metadata ?? {}) as { permisos?: string[] }).permisos ?? []
  return permisos.includes(PERMISOS.AUSENCIAS_READ)
}

/** Fila de sgrh_historial_laboral tal como se pide para armar la relación. */
export interface ContratoRow {
  lab_id: number
  lab_fecha_inicio: string
  lab_fecha_fin: string | null
  lab_salario_base: number | null
  lab_salario_real: number | null
  sgrh_liquidaciones: { liq_id: number } | { liq_id: number }[] | null
}

/** Columnas para pedir los contratos de un empleado con su liquidación (si tiene). */
export const SELECT_CONTRATO =
  'lab_id, lab_fecha_inicio, lab_fecha_fin, lab_salario_base, lab_salario_real, sgrh_liquidaciones ( liq_id )'

export function aContrato(row: ContratoRow): ContratoDelEmpleado {
  const liq = row.sgrh_liquidaciones
  const liquidado = Array.isArray(liq) ? liq.length > 0 : liq !== null && liq !== undefined
  const real = Number(row.lab_salario_real ?? 0)
  return {
    labId: row.lab_id,
    fechaInicio: row.lab_fecha_inicio,
    fechaFin: row.lab_fecha_fin,
    salarioMensual: real > 0 ? real : Number(row.lab_salario_base ?? 0),
    liquidado,
  }
}

interface DetalleRow {
  ndt_historial_laboral_id: number
  ndt_salario_bruto: number
  ndt_pagado: boolean
  sgrh_nomina_periodo: {
    npe_periodo_mes: number
    npe_periodo_anio: number
    npe_quincena: number
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

export type CargarQuincenasResult =
  { ok: true; data: Map<number, QuincenaSalario[]> } | { ok: false; error: string }

/**
 * Quincenas de planilla de los contratos pedidos, agrupadas por lab_id. Cada
 * una lleva el salario del contrato al que pertenece (ver QuincenaSalario).
 */
export async function cargarQuincenas(
  supabase: SupabaseServerClient,
  contratos: readonly ContratoDelEmpleado[]
): Promise<CargarQuincenasResult> {
  const porLab = new Map<number, QuincenaSalario[]>()
  if (contratos.length === 0) return { ok: true, data: porLab }

  const salario = new Map(contratos.map((c) => [c.labId, c.salarioMensual]))

  const { data, error } = await leerPaginado((desde, hasta) =>
    supabase
      .from('sgrh_nomina_detalle')
      .select(
        `ndt_id, ndt_historial_laboral_id, ndt_salario_bruto, ndt_pagado,
         sgrh_nomina_periodo ( npe_periodo_mes, npe_periodo_anio, npe_quincena,
                               npe_fecha_inicio_periodo, npe_fecha_fin_periodo )`
      )
      .in(
        'ndt_historial_laboral_id',
        contratos.map((c) => c.labId)
      )
      .order('ndt_id')
      .range(desde, hasta)
      .returns<DetalleRow[]>()
  )

  if (error) return { ok: false, error: 'No se pudo cargar el historial de pagos del empleado.' }

  for (const row of data ?? []) {
    const p = row.sgrh_nomina_periodo
    if (!p) continue
    const rango = rangoQuincena(p.npe_periodo_mes, p.npe_periodo_anio, p.npe_quincena)
    const fechaInicio = p.npe_fecha_inicio_periodo ?? rango?.inicio
    const fechaFin = p.npe_fecha_fin_periodo ?? rango?.fin
    if (!fechaInicio || !fechaFin) continue

    const lista = porLab.get(row.ndt_historial_laboral_id) ?? []
    lista.push({
      clave: claveQuincenal(p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena),
      etiqueta: periodoLabel(p.npe_periodo_mes, p.npe_periodo_anio, p.npe_quincena),
      fechaInicio: fechaInicio.slice(0, 10),
      fechaFin: fechaFin.slice(0, 10),
      bruto: Number(row.ndt_salario_bruto ?? 0),
      pagado: row.ndt_pagado,
      salarioMensualContrato: salario.get(row.ndt_historial_laboral_id) ?? 0,
    })
    porLab.set(row.ndt_historial_laboral_id, lista)
  }

  return { ok: true, data: porLab }
}

interface AusenciaRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  sgrh_cat_tipos_ausencia: {
    tau_codigo: string
    tau_requiere_documento_ccss: boolean
    tau_descuenta_vacaciones: boolean
  } | null
}

export interface AusenciasDelEmpleado {
  subsidios: AusenciaSubsidio[]
  /** Vacaciones aprobadas (tipos que descuentan vacaciones). */
  vacaciones: { fechaInicio: string; fechaFin: string }[]
  /** Ausencias cuyo tipo no se pudo leer: no se sabe si son subsidio. */
  sinTipo: number
}

export type CargarAusenciasResult =
  { ok: true; data: Map<number, AusenciasDelEmpleado> } | { ok: false; error: string }

/** Ausencias APROBADAS de los contratos pedidos, clasificadas, por lab_id. */
export async function cargarAusencias(
  supabase: SupabaseServerClient,
  labIds: readonly number[]
): Promise<CargarAusenciasResult> {
  const porLab = new Map<number, AusenciasDelEmpleado>()
  if (labIds.length === 0) return { ok: true, data: porLab }

  const { data, error } = await leerPaginado((desde, hasta) =>
    supabase
      .from('sgrh_ausencias')
      .select(
        `aus_id, aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin,
         sgrh_cat_tipos_ausencia ( tau_codigo, tau_requiere_documento_ccss, tau_descuenta_vacaciones )`
      )
      .in('aus_historial_laboral_id', [...labIds])
      .eq('aus_estado', 'aprobada')
      .order('aus_id')
      .range(desde, hasta)
      .returns<AusenciaRow[]>()
  )

  if (error) return { ok: false, error: 'No se pudieron cargar las ausencias del empleado.' }

  for (const row of data ?? []) {
    const actual = porLab.get(row.aus_historial_laboral_id) ?? {
      subsidios: [],
      vacaciones: [],
      sinTipo: 0,
    }
    const tipo = row.sgrh_cat_tipos_ausencia
    const rango = {
      fechaInicio: row.aus_fecha_inicio.slice(0, 10),
      fechaFin: row.aus_fecha_fin.slice(0, 10),
    }
    if (!tipo) {
      actual.sinTipo++
    } else if (tipo.tau_requiere_documento_ccss) {
      actual.subsidios.push({
        ...rango,
        esMaternidad: tipo.tau_codigo === CODIGO_LICENCIA_MATERNIDAD,
      })
    } else if (tipo.tau_descuenta_vacaciones) {
      actual.vacaciones.push(rango)
    }
    porLab.set(row.aus_historial_laboral_id, actual)
  }

  return { ok: true, data: porLab }
}

/** Junta las ausencias de varios contratos (los de una misma relación). */
export function juntarAusencias(
  porLab: Map<number, AusenciasDelEmpleado>,
  labIds: readonly number[]
): AusenciasDelEmpleado {
  const total: AusenciasDelEmpleado = { subsidios: [], vacaciones: [], sinTipo: 0 }
  for (const id of labIds) {
    const a = porLab.get(id)
    if (!a) continue
    total.subsidios.push(...a.subsidios)
    total.vacaciones.push(...a.vacaciones)
    total.sinTipo += a.sinTipo
  }
  return total
}

/** Junta las quincenas de varios contratos, ordenadas de la más vieja a la más nueva. */
export function juntarQuincenas(
  porLab: Map<number, QuincenaSalario[]>,
  labIds: readonly number[]
): QuincenaSalario[] {
  return labIds.flatMap((id) => porLab.get(id) ?? []).sort((a, b) => a.clave - b.clave)
}
