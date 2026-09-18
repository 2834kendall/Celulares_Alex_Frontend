import type { createClient } from '@/lib/supabase/server'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import {
  classifyTardiness,
  type DayForInfraction,
  type TardinessType,
} from '@/modules/attendance/lib/infractions'
import { loadTardinessTypes } from '@/modules/attendance/lib/tardinessTypes'
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

interface AssignmentJoin {
  hor_hora_entrada: string
}

interface AssignmentRow {
  prg_historial_laboral_id: number
  prg_sucursal_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_es_feriado: boolean
  prg_hora_entrada_custom: string | null
  sgrh_cat_horarios: AssignmentJoin | null
}

interface MarkDbRow {
  mar_id: number
  mar_historial_laboral_id: number
  mar_tipo: string
  mar_fecha_hora: string
  mar_tardia_justificada: boolean | null
  mar_tardia_justificacion: string | null
}

/** La entrada valida de un dia, con lo que hace falta para justificarla. */
interface EntradaDelDia {
  markId: number
  /** "HH:mm" */
  time: string
  justificada: boolean
  justificacion: string | null
}

interface AusenciaRow {
  aus_historial_laboral_id: number
  aus_fecha_inicio: string
  aus_fecha_fin: string
}

/**
 * Un DayForInfraction con lo que el calculo puro (classifyDay) no necesita
 * pero el reporte si: la fecha, y de que marca de entrada salio — sin el
 * mar_id, el modal no sabria que tardanza esta justificando.
 */
export type DayForInfractionWithDate = DayForInfraction & {
  date: string
  /** mar_id de la entrada, null si no marco ese dia. */
  entradaMarkId: number | null
  /** Motivo escrito al justificar, null si no esta justificada. */
  tardiaJustificacion: string | null
}

export interface EmployeeMonthDays {
  employeeId: number
  employmentHistoryId: number
  fullName: string
  days: DayForInfractionWithDate[]
}

export type GatherMonthlyAttendanceResult =
  | {
      ok: true
      data: EmployeeMonthDays[]
      /** Catalogo de la empresa: los llamadores lo necesitan para clasificar. */
      tipos: TardinessType[]
    }
  | { ok: false; error: string }

/**
 * Reune, por cada colaborador que trabajo en el rango dentro de las
 * sucursales que ve el usuario, sus dias programados con la hora de entrada
 * real (si marco) — la materia prima para clasificar tardias/ausencias
 * (classifyDay/summarizeMonth en lib/infractions.ts).
 *
 * El alcance sale de prg_sucursal_id (la sucursal DEL DIA) y no de
 * lab_sucursal_id (la del contrato): desde SGRH-84 el gerente puede trasladar
 * a alguien un dia puntual, y con el filtro viejo ese dia se contaba en la
 * sucursal de origen aunque se hubiera trabajado en otra. Ver lib/workingDay.ts.
 *
 * A partir de que minuto hay tardanza lo define el catalogo de tipos de la
 * empresa (sgrh_cat_tipos_tardia), que se devuelve junto con los dias para
 * que el llamador clasifique con las mismas reglas con que se filtro.
 *
 * Resuelve el alcance de sucursales del usuario (via uer_sucursal_id, que no
 * viaja en el JWT) puertas adentro para que el llamador solo pase el
 * usuarioId, no una consulta previa repetida en cada action que lo necesite.
 *
 * Compartido entre checkMonthlyInfractions (dispara la advertencia del mes en
 * curso) y getMonthlyAttendanceSummary (reporte navegable por mes): ambos
 * necesitan exactamente la misma reunion de catalogo+programacion+marcas,
 * solo difieren en que hacen con el resultado.
 */
export async function gatherMonthlyAttendanceDays(
  supabase: SupabaseServerClient,
  empresaId: number,
  usuarioId: number | undefined,
  start: string,
  end: string
): Promise<GatherMonthlyAttendanceResult> {
  const sucursalScope = usuarioId ? await getUsuarioSucursalScope(supabase, usuarioId) : null

  const tiposResult = await loadTardinessTypes(supabase, empresaId)

  if (!tiposResult.ok) {
    return { ok: false, error: tiposResult.error }
  }

  const tipos = tiposResult.data

  let assignmentsQuery = supabase
    .from('sgrh_programacion_semanal')
    .select(
      `
      prg_historial_laboral_id,
      prg_sucursal_id,
      prg_fecha,
      prg_es_dia_libre,
      prg_es_feriado,
      prg_hora_entrada_custom,
      sgrh_cat_horarios ( hor_hora_entrada )
    `
    )
    .gte('prg_fecha', start)
    .lte('prg_fecha', end)

  if (sucursalScope !== null) {
    assignmentsQuery = assignmentsQuery.in('prg_sucursal_id', sucursalScope)
  }

  const { data: assignments, error: errAssignments } =
    await assignmentsQuery.returns<AssignmentRow[]>()

  if (errAssignments) {
    return { ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' }
  }

  const conDiasAca = Array.from(new Set((assignments ?? []).map((a) => a.prg_historial_laboral_id)))

  // Plantilla de la sucursal, tenga o no dias programados en el rango.
  //
  // Sin esto el reporte solo listaba a quien alguien hubiera planificado, y
  // el gerente no podia distinguir "no tiene tardias" de "no aparece, ¿por
  // que?" — con la plantilla real a la vista, un mes sin programar se lee
  // como lo que es. Mismo criterio que el panel diario.
  let rosterQuery = supabase
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)

  if (sucursalScope !== null) {
    rosterQuery = rosterQuery.in('lab_sucursal_id', sucursalScope)
  }

  const { data: roster, error: errRoster } = await rosterQuery.returns<{ lab_id: number }[]>()

  if (errRoster) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const rosterIds = (roster ?? []).map((r) => r.lab_id)

  // Quien tiene programacion en el rango pero TODA en otras sucursales no
  // entra: sus tardias se cuentan en el reporte de la tienda donde trabajo,
  // y sumarlo aca con cero seria contarlo dos veces en dos paneles.
  const { data: enOtras, error: errOtras } = rosterIds.length
    ? await supabase
        .from('sgrh_programacion_semanal')
        .select('prg_historial_laboral_id')
        .gte('prg_fecha', start)
        .lte('prg_fecha', end)
        .in('prg_historial_laboral_id', rosterIds)
        .returns<{ prg_historial_laboral_id: number }[]>()
    : { data: [], error: null }

  if (errOtras) {
    return { ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' }
  }

  const conAlgunaProgramacion = new Set((enOtras ?? []).map((p) => p.prg_historial_laboral_id))

  const historyIds = Array.from(
    new Set([...conDiasAca, ...rosterIds.filter((id) => !conAlgunaProgramacion.has(id))])
  )

  if (historyIds.length === 0) {
    return { ok: true, data: [], tipos }
  }

  // El cruce contra el historial acota por empresa y descarta contratos ya
  // cerrados: la programacion queda como historico y sobrevive a la salida
  // del colaborador — sin este filtro se le seguirian contando ausencias a un
  // ex-empleado, y checkMonthlyInfractions le mandaria advertencias.
  const [
    { data: historial, error: errHistorial },
    { data: marks, error: errMarks },
    { data: ausencias, error: errAusencias },
  ] = await Promise.all([
    supabase
      .from('sgrh_historial_laboral')
      .select(
        `
        lab_id,
        lab_empleado_id,
        lab_sucursal_id,
        sgrh_empleados ( emp_nombre, emp_apellido_1, emp_apellido_2 )
      `
      )
      .in('lab_id', historyIds)
      .eq('lab_empresa_id', empresaId)
      .is('lab_fecha_fin', null)
      .returns<HistorialRow[]>(),
    supabase
      .from('sgrh_marcas_asistencia')
      .select(
        'mar_id, mar_historial_laboral_id, mar_tipo, mar_fecha_hora, mar_tardia_justificada, mar_tardia_justificacion'
      )
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

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (errMarks || errAusencias) {
    return { ok: false, error: 'No se pudo calcular tardias/ausencias del mes.' }
  }

  if (historial.length === 0) {
    return { ok: true, data: [], tipos }
  }

  // Dias futuros (ej. un horario ya asignado para mañana) todavia no
  // pudieron marcarse — no cuentan como tardia ni ausencia hasta que
  // efectivamente lleguen. Sin este filtro, cualquier dia programado del
  // resto del mes se veia como "ausente" apenas se le asignaba horario.
  const today = todayInCostaRica()
  // Hora actual de Costa Rica: el DIA de hoy entra al calculo, pero un turno
  // de hoy que todavia no llego al minuto del primer tipo de tardia tampoco
  // es ausencia todavia — recien se sabe al cerrarse esa ventana.
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
  const entradaByHistAndDate = new Map<string, EntradaDelDia>()
  for (const m of marks ?? []) {
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success || parsedTipo.data !== 'entrada') continue

    const date = dateOfDay(m.mar_fecha_hora)
    const key = `${m.mar_historial_laboral_id}|${date}`
    const time = timeOfDay(m.mar_fecha_hora)
    const existing = entradaByHistAndDate.get(key)
    if (!existing || time < existing.time) {
      entradaByHistAndDate.set(key, {
        markId: m.mar_id,
        time,
        justificada: m.mar_tardia_justificada ?? false,
        justificacion: m.mar_tardia_justificacion,
      })
    }
  }

  const data: EmployeeMonthDays[] = historial.map((h) => {
    const myAssignments = assignmentsByHist.get(h.lab_id) ?? []
    const employee = h.sgrh_empleados

    const days: DayForInfractionWithDate[] = myAssignments
      .map((a) => {
        const expectedRaw = a.prg_hora_entrada_custom ?? a.sgrh_cat_horarios?.hor_hora_entrada ?? ''
        const entrada = entradaByHistAndDate.get(`${h.lab_id}|${a.prg_fecha}`) ?? null
        return {
          date: a.prg_fecha,
          isJustifiedAbsence: justifiedDays.has(`${h.lab_id}|${a.prg_fecha}`),
          isDayOff: a.prg_es_dia_libre,
          isHoliday: a.prg_es_feriado,
          expectedStart: expectedRaw ? timeOfDay(expectedRaw) : null,
          entradaTime: entrada?.time ?? null,
          entradaMarkId: entrada?.markId ?? null,
          isJustifiedTardiness: entrada?.justificada ?? false,
          tardiaJustificacion: entrada?.justificacion ?? null,
        }
      })
      .filter((day) => {
        // Solo se filtra el dia de HOY, sin marca todavia, con horario real
        // (dia libre/feriado/sin programacion ya son 'no_aplica', no hace
        // falta tocarlos aca). Si ya llego el minuto en que habria sido
        // tardanza, se deja pasar — recien ahi es una ausencia real.
        if (day.date !== today || day.entradaTime || !day.expectedStart) return true
        return classifyTardiness(diffMinutes(nowTime, day.expectedStart), tipos) !== null
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

  return { ok: true, data, tipos }
}
