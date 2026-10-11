'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { PERMISOS } from '@/lib/permissions/catalog'
import { fullName } from '@/modules/employees/lib/format'
import {
  summarizeAbsences,
  summarizeEvaluations,
  summarizeMyAbsences,
  summarizeMyEvaluations,
  summarizeWeekSchedule,
  toExpiringContracts,
  type AbsencesSummary,
  type EvaluationsSummary,
  type ExpiringContract,
  type MyAbsencesSummary,
  type MyEvaluationsSummary,
  type RosterPerson,
  type WeekScheduleSummary,
} from '@/modules/dashboard/lib/extras'
import { shiftISODate } from '@/modules/attendance/lib/time'
import { getWeekDates } from '@/modules/schedules/lib/week'
import type { SgrhJwtClaims } from '@/types/auth'

/*
 * Loaders of the optional panels that no module had ready in summary form.
 *
 * Like getDashboardPeople, none of them redirects: the page only calls the
 * ones whose panel is on, for a role that can have it (see lib/panels), and
 * each still checks its permission here and returns null without it. null
 * also covers a failed query: the panel then says it could not load, and the
 * rest of the dashboard renders.
 *
 * RLS is what scopes every query to the company (and, for branch managers,
 * to their branches); the permission check here only avoids the round trip.
 */

interface RosterRow {
  lab_id: number
  lab_empleado_id: number
  lab_fecha_fin_programada: string | null
  sgrh_empleados: {
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
  } | null
  sgrh_cat_puestos: { pue_nombre: string | null } | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

const getSession = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const meta = (data?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>

  return {
    supabase,
    empresaId: meta.empresa_id ?? null,
    empId: meta.emp_id ?? null,
    permisos: Array.isArray(meta.permisos) ? meta.permisos : [],
  }
})

/**
 * Contracts in force with who holds them, by employment history id. Shared
 * by the three loaders below — `cache` makes it one query per request, no
 * matter how many of their panels are on.
 */
const getRoster = cache(async (): Promise<Map<number, RosterPerson> | null> => {
  const { supabase, empresaId } = await getSession()
  if (!empresaId) return null

  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_fecha_fin_programada,
      sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 ),
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .returns<RosterRow[]>()

  if (error) return null

  const roster = new Map<number, RosterPerson>()
  for (const row of data ?? []) {
    if (!row.sgrh_empleados) continue
    roster.set(row.lab_id, {
      labId: row.lab_id,
      employeeId: row.lab_empleado_id,
      nombre: fullName(row.sgrh_empleados),
      puesto: row.sgrh_cat_puestos?.pue_nombre ?? null,
      sucursal: row.sgrh_sucursales?.suc_nombre ?? null,
      fechaFinProgramada: row.lab_fecha_fin_programada,
    })
  }
  return roster
})

interface AusenciaRow {
  aus_id: number
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  sgrh_cat_tipos_ausencia: { tau_nombre: string; tau_es_intradia: boolean } | null
}

/** Approved absences that touch the week `todayIso` falls in. */
export async function getDashboardAbsences(todayIso: string): Promise<AbsencesSummary | null> {
  const { supabase, permisos } = await getSession()
  if (!permisos.includes(PERMISOS.AUSENCIAS_READ)) return null

  const roster = await getRoster()
  if (!roster) return null
  if (roster.size === 0) return { outToday: 0, absences: [] }

  const week = getWeekDates(todayIso)
  const { data, error } = await supabase
    .from('sgrh_ausencias')
    .select(
      'aus_id, aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin, sgrh_cat_tipos_ausencia ( tau_nombre, tau_es_intradia )'
    )
    .in('aus_historial_laboral_id', Array.from(roster.keys()))
    .eq('aus_estado', 'aprobada')
    .lte('aus_fecha_inicio', week[6])
    .gte('aus_fecha_fin', week[0])
    .returns<AusenciaRow[]>()

  if (error) return null

  return summarizeAbsences(
    (data ?? []).flatMap((row) =>
      row.sgrh_cat_tipos_ausencia
        ? [
            {
              id: row.aus_id,
              labId: row.aus_historial_laboral_id,
              fechaInicio: row.aus_fecha_inicio,
              fechaFin: row.aus_fecha_fin,
              tipo: row.sgrh_cat_tipos_ausencia.tau_nombre,
              esIntradia: row.sgrh_cat_tipos_ausencia.tau_es_intradia,
            },
          ]
        : []
    ),
    roster,
    todayIso
  )
}

interface MiAusenciaRow {
  aus_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
  aus_estado: string
  sgrh_cat_tipos_ausencia: { tau_nombre: string; tau_es_intradia: boolean } | null
}

/* How far back an absence that already ended is still worth showing. */
const MY_ABSENCES_BACK_DAYS = 30

/**
 * The reader's own absences: in force, coming, or ended in the last month,
 * whatever their state (a pending or rejected request is news to them).
 *
 * Self-service, like getMyMarks: no permission is asked, because the RLS
 * policy `ausencias_select` already lets everyone read the absences of their
 * own contracts. The filter by employee is still explicit here: for a role
 * that CAN read every absence of the company, RLS alone would return them
 * all, and this panel is only about the reader.
 */
export async function getMyAbsences(todayIso: string): Promise<MyAbsencesSummary | null> {
  const { supabase, empId } = await getSession()
  /* A user that is not an employee (an external accountant) has none. */
  if (!empId) return { pending: 0, absences: [] }

  const { data, error } = await supabase
    .from('sgrh_ausencias')
    .select(
      `
      aus_id, aus_fecha_inicio, aus_fecha_fin, aus_estado,
      sgrh_cat_tipos_ausencia ( tau_nombre, tau_es_intradia ),
      sgrh_historial_laboral!inner ( lab_empleado_id )
    `
    )
    .eq('sgrh_historial_laboral.lab_empleado_id', empId)
    .gte('aus_fecha_fin', shiftISODate(todayIso, -MY_ABSENCES_BACK_DAYS))
    .order('aus_fecha_inicio', { ascending: true })
    .returns<MiAusenciaRow[]>()

  if (error) return null

  return summarizeMyAbsences(
    (data ?? []).flatMap((row) =>
      row.sgrh_cat_tipos_ausencia
        ? [
            {
              id: row.aus_id,
              fechaInicio: row.aus_fecha_inicio,
              fechaFin: row.aus_fecha_fin,
              tipo: row.sgrh_cat_tipos_ausencia.tau_nombre,
              esIntradia: row.sgrh_cat_tipos_ausencia.tau_es_intradia,
              estado: row.aus_estado,
            },
          ]
        : []
    ),
    todayIso
  )
}

interface ProgramacionRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
}

/**
 * How the week `todayIso` falls in is staffed. Reads three columns of the
 * weekly schedule — not the shifts, branches and photos the Schedules module
 * loads to draw its grid.
 */
export async function getWeekSchedule(todayIso: string): Promise<WeekScheduleSummary | null> {
  const { supabase, permisos } = await getSession()
  const canRead =
    permisos.includes(PERMISOS.HORARIOS_READ) || permisos.includes(PERMISOS.HORARIOS_WRITE)
  if (!canRead) return null

  const week = getWeekDates(todayIso)
  const [roster, { data, error }] = await Promise.all([
    getRoster(),
    supabase
      .from('sgrh_programacion_semanal')
      .select('prg_historial_laboral_id, prg_fecha, prg_es_dia_libre')
      .gte('prg_fecha', week[0])
      .lte('prg_fecha', week[6])
      .returns<ProgramacionRow[]>(),
  ])

  if (!roster || error) return null

  return summarizeWeekSchedule(
    (data ?? []).map((row) => ({
      labId: row.prg_historial_laboral_id,
      fecha: row.prg_fecha,
      esDiaLibre: row.prg_es_dia_libre,
    })),
    roster,
    week,
    todayIso
  )
}

interface MiEvaluacionRow {
  eve_id: number
  eve_fecha_evaluacion: string
  eve_promedio_final: number | null
  eve_tipo_periodo: string
}

/* Enough for the columns the panel draws, with room for unscored ones. */
const MY_EVALUATIONS_LIMIT = 12

/**
 * The reader's own finished evaluations. Self-service like getMyAbsences:
 * the RLS policy `evaluaciones_select` lets everyone read the evaluations of
 * their own contracts, and the filter by employee is explicit for the same
 * reason as there. A draft is never shown: it is the evaluator's work in
 * progress, not a result.
 */
export async function getMyEvaluations(): Promise<MyEvaluationsSummary | null> {
  const { supabase, empId } = await getSession()
  if (!empId) return { evaluations: [], delta: null }

  const { data, error } = await supabase
    .from('sgrh_evaluaciones')
    .select(
      `
      eve_id, eve_fecha_evaluacion, eve_promedio_final, eve_tipo_periodo,
      sgrh_historial_laboral!inner ( lab_empleado_id )
    `
    )
    .eq('sgrh_historial_laboral.lab_empleado_id', empId)
    .neq('eve_estado', 'borrador')
    .order('eve_fecha_evaluacion', { ascending: false })
    .order('eve_id', { ascending: false })
    .limit(MY_EVALUATIONS_LIMIT)
    .returns<MiEvaluacionRow[]>()

  if (error) return null

  return summarizeMyEvaluations(
    (data ?? []).map((row) => ({
      id: row.eve_id,
      fecha: row.eve_fecha_evaluacion,
      promedio: row.eve_promedio_final === null ? null : Number(row.eve_promedio_final),
      periodo: row.eve_tipo_periodo,
    }))
  )
}

interface EvaluacionRow {
  eve_id: number
  eve_historial_laboral_id: number | null
  eve_fecha_evaluacion: string
  eve_promedio_final: number | null
}

/**
 * How the evaluations of the current year are going. Reads only the header
 * of each evaluation (date and final average) — not the per-criterion scores
 * the Evaluations module loads, which is what made that query too heavy for
 * a summary.
 */
export async function getDashboardEvaluations(
  todayIso: string
): Promise<EvaluationsSummary | null> {
  const { supabase, empresaId, permisos } = await getSession()
  const canRead =
    permisos.includes(PERMISOS.EVALUACIONES_READ) || permisos.includes(PERMISOS.EVALUACIONES_WRITE)
  if (!empresaId || !canRead) return null

  const year = Number(todayIso.slice(0, 4))
  const [roster, { data, error }] = await Promise.all([
    getRoster(),
    supabase
      .from('sgrh_evaluaciones')
      .select('eve_id, eve_historial_laboral_id, eve_fecha_evaluacion, eve_promedio_final')
      .eq('eve_empresa_id', empresaId)
      .gte('eve_fecha_evaluacion', `${year}-01-01`)
      .order('eve_fecha_evaluacion', { ascending: false })
      .order('eve_id', { ascending: false })
      .returns<EvaluacionRow[]>(),
  ])

  if (!roster || error) return null

  return summarizeEvaluations(
    (data ?? []).map((row) => ({
      id: row.eve_id,
      labId: row.eve_historial_laboral_id,
      fecha: row.eve_fecha_evaluacion,
      promedio: row.eve_promedio_final === null ? null : Number(row.eve_promedio_final),
    })),
    roster,
    year
  )
}

const EXPIRY_WINDOW_DAYS = 60

/** Contracts in force that end within 60 days, or should have ended already. */
export async function getExpiringContracts(todayIso: string): Promise<ExpiringContract[] | null> {
  const { permisos } = await getSession()
  if (!permisos.includes(PERMISOS.EMPLEADOS_READ)) return null

  const roster = await getRoster()
  return roster ? toExpiringContracts(roster.values(), todayIso, EXPIRY_WINDOW_DAYS) : null
}
