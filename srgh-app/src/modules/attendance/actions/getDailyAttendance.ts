'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { groupIntoDayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import { diffMinutes, timeOfDay } from '@/modules/attendance/lib/time'
import { getDayAssignments, type DayAssignment } from '@/modules/attendance/lib/workingDay'
import {
  classifyTardiness,
  PAID_BREAK_MINUTES,
  periodExcessMinutes,
  type TardinessBadge,
  type TardinessType,
} from '@/modules/attendance/lib/infractions'
import { loadTardinessTypes } from '@/modules/attendance/lib/tardinessTypes'
import { marcaTipoSchema } from '@/modules/attendance/types'
import { signEmployeePhotos } from '@/lib/storage/employee-photos'

interface EmployeeJoin {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_foto_path: string | null
}

interface PositionJoin {
  pue_nombre: string | null
}

interface EmploymentHistoryRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
  sgrh_cat_puestos: PositionJoin | null
}

interface MarkDbRow {
  mar_id: number
  mar_historial_laboral_id: number
  mar_sucursal_id: number
  mar_tipo: string
  mar_fecha_hora: string
  mar_tardia_justificada: boolean | null
  mar_tardia_justificacion: string | null
}

export interface DailyMarkInfo {
  /** mar_id — lo necesita el modal de correccion para saber que fila actualizar. */
  id: number
  /** "HH:mm" */
  time: string
  /** Diferencia contra la hora esperada, en minutos. Positivo = tarde. null si no hay hora esperada con que comparar. Dato neutro: no clasifica tardanza. */
  diffMinutes: number | null
}

/** Tardanza de la entrada, ya clasificada. null si llego a tiempo. */
export interface DailyTardiness {
  /** Tipo del catalogo de la empresa en que cae el atraso. */
  tipo: TardinessBadge
  /** Minutos de atraso contra la hora esperada. Siempre positivo. */
  diffMinutes: number
  /** El encargado la justifico: se sigue viendo, pero no cuenta para el mes. */
  isJustified: boolean
  justification: string | null
}

export interface DailyAttendanceRow {
  employmentHistoryId: number
  employeeId: number
  fullName: string
  /** URL firmada de la foto, o null si no tiene (el Avatar cae a iniciales). */
  fotoUrl: string | null
  position: string | null
  /** La sucursal DEL DIA (prg_sucursal_id), no la del contrato — ver lib/workingDay.ts. */
  branchId: number
  isDayOff: boolean
  isHoliday: boolean
  /** "HH:mm", null si no hay programacion para este dia. */
  expectedStart: string | null
  entrada: DailyMarkInfo | null
  inicioReceso: DailyMarkInfo | null
  finReceso: DailyMarkInfo | null
  inicioAlmuerzo: DailyMarkInfo | null
  finAlmuerzo: DailyMarkInfo | null
  salida: DailyMarkInfo | null
  duplicateMarksCount: number
  isOpen: boolean
  /**
   * Clasificacion del atraso de la entrada (SGRH-87). null cuando llego a
   * tiempo, no marco, o no hay hora esperada con que comparar.
   */
  tardiness: DailyTardiness | null
  /** Tardanza al volver del almuerzo, con el mismo catalogo (SGRH-88). */
  lunchTardiness: DailyTardiness | null
  /**
   * Minutos que el almuerzo se paso de su duracion programada. null si no hay
   * almuerzo programado o no se marco completo; 0 si no se paso.
   */
  lunchExcessMinutes: number | null
  /**
   * Minutos de receso por encima de los pagados. null si no se marco
   * completo; 0 si no se paso.
   */
  breakExcessMinutes: number | null
}

/**
 * Clasifica una marca que puede llegar tarde (la entrada o el regreso del
 * almuerzo) contra el catalogo, con su justificacion. null si llego a
 * tiempo o no hay hora esperada con que comparar.
 */
function tardinessOf(
  info: DailyMarkInfo | null,
  raw: RawMark | null,
  tipos: TardinessType[],
  justificaciones: Map<number, { justificada: boolean; motivo: string | null }>
): DailyTardiness | null {
  if (!info || !raw || info.diffMinutes === null) return null

  const tipo = classifyTardiness(info.diffMinutes, tipos)
  if (!tipo) return null

  const justificacion = justificaciones.get(raw.id)

  return {
    tipo: { nombre: tipo.nombre, color: tipo.color },
    diffMinutes: info.diffMinutes,
    isJustified: justificacion?.justificada ?? false,
    justification: justificacion?.motivo ?? null,
  }
}

export type GetDailyAttendanceResult =
  { ok: true; date: string; data: DailyAttendanceRow[] } | { ok: false; error: string }

/**
 * Quienes trabajaron ESE dia en las sucursales que ve el usuario, con sus
 * marcas.
 *
 * Arranca desde la programacion del dia y no desde el contrato (ver
 * lib/workingDay.ts). Antes listaba a todos los activos por lab_sucursal_id,
 * y desde SGRH-84 eso mostraba mal a los dos lados de un traslado: el gerente
 * de la sucursal de origen seguia viendo a alguien que ese dia no estuvo ahi,
 * y el de destino no lo veia aunque hubiera trabajado en su tienda — con el
 * agravante de que la RLS de marcas filtra por sucursal_visible(mar_sucursal_id),
 * asi que la marca era visible para el gerente equivocado.
 */
export async function getDailyAttendance(dateISO: string): Promise<GetDailyAttendanceResult> {
  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const meta = claims.app_metadata as { empresa_id?: number; usr_id?: number }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  // La sucursal del gerente NO viaja en el JWT (decision del equipo, SGRH-21):
  // se resuelve en vivo. null = sin restriccion (ADMIN/RRHH, o sin filas
  // activas), que ven las marcas de toda la empresa — igual que
  // get-sucursal-actual.ts. Un gerente a cargo de varias sucursales ve las
  // marcas de todas las suyas en una sola pantalla.
  const sucursalIds = meta.usr_id ? await getUsuarioSucursalScope(supabase, meta.usr_id) : null

  // Dia libre y feriado se traen tambien: el panel los muestra como tales.
  // Filtrar por "se trabaja" es cosa del kiosco, no de esta vista.
  const assignments = await getDayAssignments(supabase, dateISO, sucursalIds)

  if (!assignments.ok) {
    return { ok: false, error: assignments.error }
  }

  let marksQuery = supabase
    .from('sgrh_marcas_asistencia')
    .select(
      'mar_id, mar_historial_laboral_id, mar_sucursal_id, mar_tipo, mar_fecha_hora, mar_tardia_justificada, mar_tardia_justificacion'
    )
    .gte('mar_fecha_hora', `${dateISO} 00:00:00`)
    .lte('mar_fecha_hora', `${dateISO} 23:59:59`)

  if (sucursalIds !== null) {
    marksQuery = marksQuery.in('mar_sucursal_id', sucursalIds)
  }

  const { data: marks, error: errMarks } = await marksQuery.returns<MarkDbRow[]>()

  if (errMarks) {
    return { ok: false, error: 'No se pudieron cargar las marcas del dia.' }
  }

  // Plantilla de la sucursal: los contratos activos, tengan turno hoy o no.
  //
  // "Sin turno no se marca" es una regla del KIOSCO, no de esta pantalla. El
  // panel es donde el encargado corrige y agrega marcas a mano, asi que
  // esconder a quien no quedo programado le quita justamente la herramienta
  // para arreglarlo — y deja el dia en blanco cuando nadie planifico, que es
  // lo contrario de lo que el gerente necesita ver.
  let rosterQuery = supabase
    .from('sgrh_historial_laboral')
    .select('lab_id')
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)

  if (sucursalIds !== null) {
    rosterQuery = rosterQuery.in('lab_sucursal_id', sucursalIds)
  }

  const { data: roster, error: errRoster } = await rosterQuery.returns<{ lab_id: number }[]>()

  if (errRoster) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const rosterIds = (roster ?? []).map((r) => r.lab_id)

  // De la plantilla se descuenta a quien ese dia fue trasladado a OTRA
  // sucursal: ya aparece en el panel de la tienda donde de verdad trabajo, y
  // sin este descuento saldria en los dos a la vez — el bug que este ticket
  // vino a cerrar.
  //
  // La consulta va sin filtro de sucursal a proposito, pero la RLS de
  // programacion_semanal solo deja ver las sucursales del usuario: un gerente
  // que no alcanza a ver la otra tienda no se entera del traslado y sigue
  // viendo a esa persona en su panel. Es una degradacion aceptable — en el
  // panel solo duplica una fila de lectura, no habilita a nadie a marcar.
  const { data: elsewhere, error: errElsewhere } = rosterIds.length
    ? await supabase
        .from('sgrh_programacion_semanal')
        .select('prg_historial_laboral_id, prg_sucursal_id')
        .eq('prg_fecha', dateISO)
        .in('prg_historial_laboral_id', rosterIds)
        .returns<{ prg_historial_laboral_id: number; prg_sucursal_id: number }[]>()
    : { data: [], error: null }

  if (errElsewhere) {
    return { ok: false, error: 'No se pudo cargar la programacion del dia.' }
  }

  const trasladados = new Set(
    (elsewhere ?? [])
      .filter((p) => sucursalIds !== null && !sucursalIds.includes(p.prg_sucursal_id))
      .map((p) => p.prg_historial_laboral_id)
  )

  // Las marcas se consultan por sucursal y no por la lista de programados, y
  // despues se unen las tres: una marca cuya programacion se borro o se movio
  // a otra tienda despues del hecho seguiria existiendo, y dejarla fuera la
  // volveria invisible para todos. Es preferible una fila sin turno asignado
  // a una marca que no aparece en ningun panel.
  const historyIds = Array.from(
    new Set([
      ...assignments.data.map((a) => a.employmentHistoryId),
      ...(marks ?? []).map((m) => m.mar_historial_laboral_id),
      ...rosterIds.filter((id) => !trasladados.has(id)),
    ])
  )

  if (historyIds.length === 0) {
    return { ok: true, date: dateISO, data: [] }
  }

  const { data: employmentHistory, error: errHistory } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_foto_path ),
      sgrh_cat_puestos ( pue_nombre )
    `
    )
    // Sin `lab_fecha_fin is null`: si alguien salio de la empresa a mitad de
    // mes, sus marcas de los dias que si trabajo tienen que seguir viendose
    // al navegar hacia atras en el panel.
    .in('lab_id', historyIds)
    .eq('lab_empresa_id', meta.empresa_id)
    .returns<EmploymentHistoryRow[]>()

  if (errHistory) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (employmentHistory.length === 0) {
    return { ok: true, date: dateISO, data: [] }
  }

  const assignmentByHistoryId = new Map<number, DayAssignment>()
  for (const a of assignments.data) {
    assignmentByHistoryId.set(a.employmentHistoryId, a)
  }

  const marksByHistoryId = new Map<number, RawMark[]>()
  // Sucursal donde de verdad se marco, para las filas sin programacion: sin
  // ella la fila caeria a la del contrato y el modal de correccion guardaria
  // la marca corregida en la tienda equivocada.
  const markBranchByHistoryId = new Map<number, number>()
  // Justificacion por mar_id: solo la de la entrada se termina usando, pero
  // indexar por id evita repetir el recorrido buscando cual era.
  const justificacionByMarkId = new Map<number, { justificada: boolean; motivo: string | null }>()

  for (const m of marks ?? []) {
    // mar_tipo es varchar sin enum en los tipos generados: se valida aca y se
    // descarta en silencio una fila que no calce (no deberia ocurrir con el
    // CHECK de la migracion aplicado, pero no debe tumbar todo el dashboard).
    const parsedTipo = marcaTipoSchema.safeParse(m.mar_tipo)
    if (!parsedTipo.success) continue

    const rawMark: RawMark = { id: m.mar_id, tipo: parsedTipo.data, fechaHora: m.mar_fecha_hora }
    const list = marksByHistoryId.get(m.mar_historial_laboral_id) ?? []
    list.push(rawMark)
    marksByHistoryId.set(m.mar_historial_laboral_id, list)

    if (!markBranchByHistoryId.has(m.mar_historial_laboral_id)) {
      markBranchByHistoryId.set(m.mar_historial_laboral_id, m.mar_sucursal_id)
    }

    justificacionByMarkId.set(m.mar_id, {
      justificada: m.mar_tardia_justificada ?? false,
      motivo: m.mar_tardia_justificacion,
    })
  }

  // Catalogo de tipos de tardia de la empresa: define desde que minuto hay
  // tardanza y de que tipo es cada una.
  const tiposResult = await loadTardinessTypes(supabase, meta.empresa_id)

  if (!tiposResult.ok) {
    return { ok: false, error: tiposResult.error }
  }

  const tipos = tiposResult.data

  // Una sola firma para toda la jornada (ver signEmployeePhotos).
  const fotoUrls = await signEmployeePhotos(
    employmentHistory.map((h) => h.sgrh_empleados?.emp_foto_path)
  )

  const data: DailyAttendanceRow[] = employmentHistory.map((h) => {
    const employee = h.sgrh_empleados
    const fullName = employee
      ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
      : 'Sin nombre'

    const assignment = assignmentByHistoryId.get(h.lab_id)

    const journey = groupIntoDayJourney(marksByHistoryId.get(h.lab_id) ?? [])

    // Cada marca se compara contra SU hora programada: la entrada contra la
    // entrada, el almuerzo y el receso contra los suyos (SGRH-88). La salida
    // sigue sin comparacion — nadie definio todavia que es "salir tarde".
    function markInfo(mark: RawMark | null, expected: string | null): DailyMarkInfo | null {
      if (!mark) return null
      const time = timeOfDay(mark.fechaHora)
      return {
        id: mark.id,
        time,
        diffMinutes: expected ? diffMinutes(time, expected) : null,
      }
    }

    // El orden importa: manda el turno del dia, despues donde se marco de
    // verdad, y la del contrato solo como ultimo recurso.
    const branchId =
      assignment?.branchId ?? markBranchByHistoryId.get(h.lab_id) ?? h.lab_sucursal_id

    const entrada = markInfo(journey.entrada, assignment?.expectedStart ?? null)

    // Un dia libre, feriado o sin turno no tiene tardanza: no habia hora a la
    // que llegar. Es el mismo criterio de tardinessOfDay, que aca no se puede
    // reusar tal cual porque trabaja sobre el mes y no sobre la fila del dia.
    const noSeTrabaja = (assignment?.isDayOff ?? false) || (assignment?.isHoliday ?? false)

    const inicioReceso = markInfo(journey.inicioReceso, assignment?.expectedBreakStart ?? null)
    const finReceso = markInfo(journey.finReceso, assignment?.expectedBreakEnd ?? null)
    const inicioAlmuerzo = markInfo(journey.inicioAlmuerzo, assignment?.expectedLunchStart ?? null)
    const finAlmuerzo = markInfo(journey.finAlmuerzo, assignment?.expectedLunchEnd ?? null)

    const tardiness = noSeTrabaja
      ? null
      : tardinessOf(entrada, journey.entrada, tipos, justificacionByMarkId)
    const lunchTardiness = noSeTrabaja
      ? null
      : tardinessOf(finAlmuerzo, journey.finAlmuerzo, tipos, justificacionByMarkId)

    // El almuerzo se mide contra la duracion PROGRAMADA (fin - inicio del
    // turno), no contra la hora: quien sale a la 1 en vez de a las 12 y toma
    // su hora completa no se paso de nada.
    const lunchAllowed =
      assignment?.expectedLunchStart && assignment?.expectedLunchEnd
        ? diffMinutes(assignment.expectedLunchEnd, assignment.expectedLunchStart)
        : null

    return {
      employmentHistoryId: h.lab_id,
      employeeId: h.lab_empleado_id,
      fullName,
      // emp_foto_path nunca cruza al cliente: solo la URL firmada opaca.
      fotoUrl: employee?.emp_foto_path ? (fotoUrls[employee.emp_foto_path] ?? null) : null,
      position: h.sgrh_cat_puestos?.pue_nombre ?? null,
      branchId,
      isDayOff: assignment?.isDayOff ?? false,
      isHoliday: assignment?.isHoliday ?? false,
      expectedStart: assignment?.expectedStart ?? null,
      entrada,
      inicioReceso,
      finReceso,
      inicioAlmuerzo,
      finAlmuerzo,
      salida: markInfo(journey.salida, null),
      duplicateMarksCount: journey.duplicates.length,
      isOpen: journey.isOpen,
      tardiness,
      lunchTardiness,
      lunchExcessMinutes:
        inicioAlmuerzo && finAlmuerzo && lunchAllowed !== null
          ? periodExcessMinutes(inicioAlmuerzo.time, finAlmuerzo.time, lunchAllowed)
          : null,
      // El receso se mide contra los minutos pagados, con o sin receso
      // programado: es la regla con que la matriz semanal calcula las horas.
      breakExcessMinutes:
        inicioReceso && finReceso
          ? periodExcessMinutes(inicioReceso.time, finReceso.time, PAID_BREAK_MINUTES)
          : null,
    }
  })

  data.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, date: dateISO, data }
}
