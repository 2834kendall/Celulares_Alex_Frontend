'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_EVALUACIONES } from '@/lib/permissions/zones'
import { averageScore, parseNotes } from '@/modules/evaluations/lib/scoring'
import type { BranchOption, CollaboratorRow, EvaluationDetail } from '@/modules/evaluations/types'

interface EmployeeJoin {
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_numero_identificacion: string
}

interface HistoryRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
  sgrh_cat_puestos: { pue_nombre: string | null } | null
  sgrh_sucursales: { suc_id: number; suc_nombre: string } | null
}

interface ResultJoin {
  evr_criterio_id: number
  evr_puntaje: number | null
  evr_observacion: string | null
  evr_no_aplica: boolean
}

interface EvaluatorJoin {
  usr_email: string
  sgrh_empleados: { emp_nombre: string; emp_apellido_1: string } | null
}

interface EvaluationRow {
  eve_id: number
  eve_historial_laboral_id: number | null
  eve_tipo_evaluacion: string
  eve_fecha_evaluacion: string
  eve_tipo_periodo: string
  eve_promedio_final: number | null
  eve_resultado_texto: string | null
  eve_observaciones: string | null
  sgrh_evaluacion_resultados: ResultJoin[]
  sgrh_usuarios: EvaluatorJoin | null
}

export interface EvaluationsOverview {
  collaborators: CollaboratorRow[]
  branches: BranchOption[]
}

export type GetEvaluationsOverviewResult =
  ({ ok: true } & EvaluationsOverview) | { ok: false; error: string }

function toDetail(row: EvaluationRow): EvaluationDetail {
  const scores: Record<number, number> = {}
  const observations: Record<number, string> = {}
  for (const r of row.sgrh_evaluacion_resultados) {
    if (!r.evr_no_aplica && r.evr_puntaje !== null) {
      // Las notas se manejan como enteros; se redondean los registros
      // historicos que quedaron con decimales.
      scores[r.evr_criterio_id] = Math.round(Number(r.evr_puntaje))
    }
    if (r.evr_observacion) {
      observations[r.evr_criterio_id] = r.evr_observacion
    }
  }

  const evaluator = row.sgrh_usuarios
  const evaluatorName = evaluator?.sgrh_empleados
    ? `${evaluator.sgrh_empleados.emp_nombre} ${evaluator.sgrh_empleados.emp_apellido_1}`
    : (evaluator?.usr_email ?? null)

  const promedio =
    row.eve_promedio_final !== null
      ? Math.round(Number(row.eve_promedio_final))
      : averageScore(Object.values(scores))

  return {
    id: row.eve_id,
    fecha: row.eve_fecha_evaluacion,
    periodo: row.eve_tipo_periodo,
    tipo: row.eve_tipo_evaluacion,
    promedio,
    resultado: row.eve_resultado_texto,
    evaluador: evaluatorName,
    scores,
    observations,
    notes: parseNotes(row.eve_observaciones),
  }
}

export async function getEvaluationsOverview(): Promise<GetEvaluationsOverviewResult> {
  const claims = await requireAnyPermission(ACCESO_EVALUACIONES)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const [historyResult, evaluationsResult] = await Promise.all([
    supabase
      .from('sgrh_historial_laboral')
      .select(
        `
        lab_id,
        lab_empleado_id,
        lab_sucursal_id,
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2, emp_numero_identificacion ),
        sgrh_cat_puestos ( pue_nombre ),
        sgrh_sucursales ( suc_id, suc_nombre )
      `
      )
      .eq('lab_empresa_id', empresaId)
      .is('lab_fecha_fin', null)
      .returns<HistoryRow[]>(),
    supabase
      .from('sgrh_evaluaciones')
      .select(
        `
        eve_id,
        eve_historial_laboral_id,
        eve_tipo_evaluacion,
        eve_fecha_evaluacion,
        eve_tipo_periodo,
        eve_promedio_final,
        eve_resultado_texto,
        eve_observaciones,
        sgrh_evaluacion_resultados ( evr_criterio_id, evr_puntaje, evr_observacion, evr_no_aplica ),
        sgrh_usuarios ( usr_email, sgrh_empleados ( emp_nombre, emp_apellido_1 ) )
      `
      )
      .eq('eve_empresa_id', empresaId)
      .order('eve_fecha_evaluacion', { ascending: false })
      .order('eve_id', { ascending: false })
      .returns<EvaluationRow[]>(),
  ])

  if (historyResult.error) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores de la empresa.' }
  }

  if (evaluationsResult.error) {
    return { ok: false, error: 'No se pudieron cargar las evaluaciones registradas.' }
  }

  // Las evaluaciones vienen de mas reciente a mas antigua: la primera por
  // colaborador es su evaluacion vigente y el resto forma su historico.
  const historyByLabId = new Map<number, EvaluationDetail[]>()
  for (const row of evaluationsResult.data ?? []) {
    if (row.eve_historial_laboral_id === null) continue
    const list = historyByLabId.get(row.eve_historial_laboral_id) ?? []
    list.push(toDetail(row))
    historyByLabId.set(row.eve_historial_laboral_id, list)
  }

  const collaborators: CollaboratorRow[] = (historyResult.data ?? [])
    .map((h) => {
      const employee = h.sgrh_empleados
      const fullName = employee
        ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
        : 'Sin nombre'
      const history = historyByLabId.get(h.lab_id) ?? []

      return {
        labId: h.lab_id,
        empId: h.lab_empleado_id,
        fullName,
        idNumber: employee?.emp_numero_identificacion ?? '',
        position: h.sgrh_cat_puestos?.pue_nombre ?? null,
        branchId: h.lab_sucursal_id,
        branchName: h.sgrh_sucursales?.suc_nombre ?? 'Sin sucursal',
        evaluation: history[0] ?? null,
        history,
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  const branches: BranchOption[] = []
  const seen = new Set<number>()
  for (const c of collaborators) {
    if (!seen.has(c.branchId)) {
      seen.add(c.branchId)
      branches.push({ id: c.branchId, name: c.branchName })
    }
  }
  branches.sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return { ok: true, collaborators, branches }
}
