import type { createClient } from '@/lib/supabase/server'
import type { DayForInfraction } from '@/modules/attendance/lib/infractions'
import {
  dateOfDay,
  diffMinutes,
  nowInCostaRica,
  shiftISODate,
  timeOfDay,
  todayInCostaRica,
} from '@/modules/attendance/lib/time'
import { marcaTipoSchema } from '@/modules/attendance/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const DEFAULT_TOLERANCIA_MINUTOS = 2

interface EmployeeJoin {
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
}

interface HistorialRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
}

interface SucursalToleranciaRow {
  suc_id: number
  suc_tolerancia_tardia_minutos: number
}

interface AssignmentJoin {
  hor_hora_entrada: string
}

interface AssignmentRow {
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  sgrh_cat_horarios: AssignmentJoin | null
}

interface MarkDbRow {
  mar_historial_laboral_id: number
  mar_tipo: string
  mar_fecha_hora: string
}

interface AusenciaRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
}

/** Un DayForInfraction con su fecha — el calculo puro (classifyDay) no la necesita, pero reportarla si. */
export type DayForInfractionWithDate = DayForInfraction & { date: string }

export interface EmployeeMonthDays {
  employeeId: number
  employmentHistoryId: number
  fullName: string
  days: DayForInfractionWithDate[]
}

export type GatherMonthlyAttendanceResult =
  { ok: true; data: EmployeeMonthDays[] } | { ok: false; error: string }

/**
 * Reune, por cada colaborador activo de la empresa (y sucursal fija del
 * gerente, si tiene una) de un rango de fechas, sus dias programados con la
 * hora de entrada real (si marco) — la materia prima para clasificar
 * tardias/ausencias (classifyDay/summarizeMonth en lib/infractions.ts).
 *
 * Resuelve la sucursal del usuario (via uer_sucursal_id, que no viaja en el
 * JWT) puertas adentro para que el llamador solo pase el usuarioId, no una
 * consulta previa repetida en cada action que lo necesite.
 *
 * Compartido entre checkMonthlyInfractions (dispara la advertencia del mes en
 * curso) y getMonthlyAttendanceSummary (reporte navegable por mes): ambos
 * necesitan exactamente la misma reunion de tolerancia+programacion+marcas,
 * solo difieren en que hacen con el resultado.
 */
export async function gatherMonthlyAttendanceDays(
  supabase: SupabaseServerClient,
  empresaId: number,
  usuarioId: number | undefined,
  start: string,
  end: string
): Promise<GatherMonthlyAttendanceResult> {
  let sucursalId: number | null = null
  if (usuarioId) {
    const { data: asignacion } = await supabase
      .from('sgrh_usuarios_empresa_rol')
      .select('uer_sucursal_id')
      .eq('uer_usuario_id', usuarioId)
      .eq('uer_activo', true)
      .maybeSingle<{ uer_sucursal_id: number | null }>()
    sucursalId = asignacion?.uer_sucursal_id ?? null
  }

  let historialQuery = supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)

  if (sucursalId !== null) {
    historialQuery = historialQuery.eq('lab_sucursal_id', sucursalId)
  }

  const { data: historial, error: errHistorial } = await historialQuery.returns<HistorialRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (historial.length === 0) {
    return { ok: true, data: [] }
  }

  const historyIds = historial.map((h) => h.lab_id)
  const sucursalIds = Array.from(new Set(historial.map((h) => h.lab_sucursal_id)))

  const [
    { data: tolerancias, error: errTolerancias },
    { data: assignments, error: errAssignments },
    { data: marks, error: errMarks },
    { data: ausencias, error: errAusencias },
  ] = await Promise.all([
    supabase
      .from('sgrh_sucursales')
      .select('suc_id, suc_tolerancia_tardia_minutos')
      .in('suc_id', sucursalIds)
      .returns<SucursalToleranciaRow[]>(),
    supabase
      .from('sgrh_programacion_semanal')
      .select(
        `
        prg_historial_laboral_id,
        prg_fecha,
        prg_es_dia_libre,
        prg_es_feriado,
        prg_hora_entrada_custom,
        sgrh_cat_horarios ( hor_hora_entrada )
      `
      )
      .in('prg_historial_laboral_id', historyIds)
      .gte('prg_fecha', start)
      .lte('prg_fecha', end)
      .returns<AssignmentRow[]>(),
    supabase
      .from('sgrh_marcas_asistencia')
      .select('mar_historial_laboral_id, mar_tipo, mar_fecha_hora')
      .in('mar_historial_laboral_id', historyIds)
      .eq('mar_tipo', 'entrada')
      .gte('mar_fecha_hora', `${start} 00:00:00`)
      .lte('mar_fecha_hora', `${end} 23:59:59`)
      .returns<MarkDbRow[]>(),
    // Ausencias aprobadas que se SOLAPAN con el rango (no las contenidas en
    // el): una incapacidad del 28 de junio al 3 de julio cubre dias de julio
    // aunque empiece antes, por eso se compara inicio<=fin_rango y
    // fin>=inicio_rango en vez de meter ambas fechas dentro del mes.
    supabase
      .from('sgrh_ausencias')
      .select('aus_historial_laboral_id, aus_fecha_inicio, aus_fecha_fin')
      .in('aus_historial_laboral_id', historyIds)
      .eq('aus_estado', 'aprobada')
      .lte('aus_fecha_inicio', end)
      .gte('aus_fecha_fin', start)
      .returns<AusenciaRow[]>(),
  ])

  if (errTolerancias || errAssignments || errMarks || errAusencias) {
    return { ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' }
  }

  const toleranciaBySucursal = new Map(
    (tolerancias ?? []).map((t) => [t.suc_id, t.suc_tolerancia_tardia_minutos])
  )

  // Dias futuros (ej. un horario ya asignado para mañana) todavia no
  // pudieron marcarse — no cuentan como tardia ni ausencia hasta que
  // efectivamente lleguen. Sin este filtro, cualquier dia programado del
  // resto del mes se veia como "ausente" apenas se le asignaba horario.
  const today = todayInCostaRica()
  // Hora actual de Costa Rica: el DIA de hoy entra al calculo, pero un turno
  // de hoy que todavia no llego a su hora+tolerancia tampoco es ausencia
  // todavia — recien se sabe al cerrarse esa ventana.
  const nowTime = timeOfDay(nowInCostaRica())

  const assignmentsByHist = new Map<number, AssignmentRow[]>()
  for (const a of assignments ?? []) {
    if (a.prg_fecha > today) continue
    const list = assignmentsByHist.get(a.prg_historial_laboral_id) ?? []
    list.push(a)
    assignmentsByHist.set(a.prg_historial_laboral_id, list)
  }

  // Dias cubiertos por una ausencia aprobada, expandidos a claves
  // "historial|fecha". El rango se recorta al mes consultado antes de
  // expandirlo para no generar claves de dias que nadie va a preguntar.
  //
  // Ojo: leer esta tabla exige el permiso AUSENCIAS_READ. Si el rol que abre
  // el panel no lo tiene, RLS no devuelve error — devuelve cero filas, y
  // todo vuelve a contarse como ausencia sin ninguna señal visible.
  const justifiedDays = new Set<string>()
  for (const a of ausencias ?? []) {
    const from = a.aus_fecha_inicio > start ? a.aus_fecha_inicio : start
    const to = a.aus_fecha_fin < end ? a.aus_fecha_fin : end

    for (let d = from; d <= to; d = shiftISODate(d, 1)) {
      justifiedDays.add(`${a.aus_historial_laboral_id}|${d}`)
    }
  }

  // Primera marca de entrada valida por (historial, fecha) — mismo criterio
  // de "primera cronologica gana" que groupIntoDayJourney, aplicado por dia.
  const entradaByHistAndDate = new Map<string, string>()
  for (const m of marks ?? []) {
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success || parsedTipo.data !== 'entrada') continue

    const date = dateOfDay(m.mar_fecha_hora)
    const key = `${m.mar_historial_laboral_id}|${date}`
    const time = timeOfDay(m.mar_fecha_hora)
    const existing = entradaByHistAndDate.get(key)
    if (!existing || time < existing) {
      entradaByHistAndDate.set(key, time)
    }
  }

  const data: EmployeeMonthDays[] = historial.map((h) => {
    const tolerancia = toleranciaBySucursal.get(h.lab_sucursal_id) ?? DEFAULT_TOLERANCIA_MINUTOS
    const myAssignments = assignmentsByHist.get(h.lab_id) ?? []
    const employee = h.sgrh_empleados

    const days: DayForInfractionWithDate[] = myAssignments
      .map((a) => {
        const expectedRaw = a.prg_hora_entrada_custom ?? a.sgrh_cat_horarios?.hor_hora_entrada ?? ''
        return {
          date: a.prg_fecha,
          isJustifiedAbsence: justifiedDays.has(`${h.lab_id}|${a.prg_fecha}`),
          isDayOff: a.prg_es_dia_libre,
          isHoliday: a.prg_es_feriado,
          expectedStart: expectedRaw ? timeOfDay(expectedRaw) : null,
          entradaTime: entradaByHistAndDate.get(`${h.lab_id}|${a.prg_fecha}`) ?? null,
          toleranciaMinutos: tolerancia,
        }
      })
      .filter((day) => {
        // Solo se filtra el dia de HOY, sin marca todavia, con horario real
        // (dia libre/feriado/sin programacion ya son 'no_aplica', no hace
        // falta tocarlos aca). Si la hora esperada + tolerancia ya paso,
        // se deja pasar — recien ahi es una ausencia/tardanza real.
        if (day.date !== today || day.entradaTime || !day.expectedStart) return true
        return diffMinutes(nowTime, day.expectedStart) > day.toleranciaMinutos
      })

    return {
      employeeId: h.lab_empleado_id,
      employmentHistoryId: h.lab_id,
      fullName: employee
        ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
        : 'Sin nombre',
      days,
    }
  })

  return { ok: true, data }
}
