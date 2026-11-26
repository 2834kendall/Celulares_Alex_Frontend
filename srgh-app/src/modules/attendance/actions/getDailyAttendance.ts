'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { groupIntoDayJourney, type RawMark } from '@/modules/attendance/lib/marks'
import {
  diffMinutes,
  nowInCostaRica,
  timeOfDay,
  todayInCostaRica,
} from '@/modules/attendance/lib/time'
import {
  attendanceStatusOf,
  type DayClock,
  type DayStatus,
} from '@/modules/attendance/lib/dayStatus'
import { getDayAssignments, type DayAssignment } from '@/modules/attendance/lib/workingDay'
import { secondBlockStart } from '@/modules/attendance/lib/secondBlock'
import { scheduledBlockAtTime, type ScheduledBlock } from '@/modules/attendance/lib/dayJourney'
import {
  classifyTardiness,
  LUNCH_MINUTES,
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

interface AusenciaDelDiaRow {
  aus_historial_laboral_id: number
  sgrh_cat_tipos_ausencia: { tau_nombre: string; tau_es_intradia: boolean } | null
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

type DailyRawMark = RawMark & { branchId: number }

export interface DailyScheduledBlock extends ScheduledBlock {
  branchName: string | null
  entrada: DailyMarkInfo | null
  salida: DailyMarkInfo | null
}

function scheduledBlocksOf(assignments: DayAssignment[]) {
  return assignments
    .filter((assignment) => !assignment.isDayOff && !assignment.isHoliday)
    .flatMap((assignment) => {
      const branch = { branchId: assignment.branchId, branchName: assignment.branchName ?? null }
      const blocks = []
      if (assignment.expectedStart && assignment.expectedEnd) {
        blocks.push({ ...branch, inicio: assignment.expectedStart, fin: assignment.expectedEnd })
      }
      if (assignment.expectedSecondBlockStart && assignment.expectedSecondBlockEnd) {
        blocks.push({
          ...branch,
          inicio: assignment.expectedSecondBlockStart,
          fin: assignment.expectedSecondBlockEnd,
        })
      }
      return blocks
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

function splitBlockMarks(blocks: ScheduledBlock[], marks: DailyRawMark[]) {
  const marksByBlock = blocks.map(() => [] as RawMark[])
  for (const mark of marks) {
    if (mark.tipo !== 'entrada' && mark.tipo !== 'salida') continue
    const time = timeOfDay(mark.fechaHora)
    const inRange = scheduledBlockAtTime(blocks, time, mark.tipo)
    const atBranch = blocks.filter((block) => block.branchId === mark.branchId)
    const candidates = atBranch.length ? atBranch : blocks
    const boundary = mark.tipo === 'entrada' ? 'inicio' : 'fin'
    // Las entradas anticipadas y las salidas tardías también pertenecen a un bloque.
    const nearest = candidates.reduce((best, candidate) =>
      Math.abs(diffMinutes(time, candidate[boundary])) < Math.abs(diffMinutes(time, best[boundary]))
        ? candidate
        : best
    )
    marksByBlock[blocks.indexOf(inRange ?? nearest)].push(mark)
  }
  return marksByBlock.map((blockMarks) => groupIntoDayJourney(blockMarks))
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
  /**
   * Como esta la persona ese dia (SGRH-120), con la misma regla que la
   * tarjeta del dashboard. Ver docs/estados-del-dia.md.
   */
  status: DayStatus
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
  /**
   * Tipo de la ausencia aprobada que cubre el dia (ej. "Incapacidad por
   * Enfermedad"), null si no hay. Registrada desde Horarios o justificada
   * desde "Por justificar" (SGRH-88).
   */
  ausencia: string | null
  /** "HH:mm", null si no hay programacion para este dia. */
  expectedStart: string | null
  entrada: DailyMarkInfo | null
  inicioReceso: DailyMarkInfo | null
  finReceso: DailyMarkInfo | null
  inicioAlmuerzo: DailyMarkInfo | null
  finAlmuerzo: DailyMarkInfo | null
  salida: DailyMarkInfo | null
  /**
   * Un dia de varios bloques (SGRH-110: jornada partida, o un tramo por
   * sucursal) trae una entrada y una salida por bloque. `entrada` es la del
   * primero y `salida` la del ultimo; aca van todos, en orden. Vacio en un dia
   * de un solo bloque.
   */
  blocks: { entrada: DailyMarkInfo; salida: DailyMarkInfo | null }[]
  scheduledBlocks: DailyScheduledBlock[]
  /** El 2.º bloque de ese dia tiene una justificacion por bloque (SGRH-120). */
  isSecondBlockJustified: boolean
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
   * Tardanza al entrar al segundo bloque de un dia partido, con el mismo
   * catalogo (SGRH-110). null si llego a tiempo, no hay segundo bloque o no
   * marco su entrada.
   */
  secondBlockTardiness: DailyTardiness | null
  /**
   * Minutos que el almuerzo se paso de su hora, contada desde la marca de
   * inicio (SGRH-95). null si no se marco completo; 0 si no se paso.
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
  //
  // El catalogo de tipos de tardia no depende de nada: se pide junto con el
  // alcance y se revisa mas abajo, en el mismo punto de siempre. Cada viaje a
  // Supabase cuesta ~200 ms desde CR, asi que todo lo que no depende de un
  // resultado anterior va en la misma tanda.
  const [alcance, tiposResult, filtro] = await Promise.all([
    meta.usr_id ? getUsuarioSucursalScope(supabase, meta.usr_id) : Promise.resolve(null),
    loadTardinessTypes(supabase, meta.empresa_id),
    getFiltroMarca(),
  ])

  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }

  // Con una marca elegida se ve como un gerente de esas tiendas: el descuento de
  // trasladados de abajo sirve igual.
  const sucursalIds = filtro.sucursalIds ?? alcance

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

  // Programacion, marcas y plantilla solo dependen del alcance.
  const [assignments, { data: marks, error: errMarks }, { data: roster, error: errRoster }] =
    await Promise.all([
      // Dia libre y feriado se traen tambien: el panel los muestra como tales.
      // Filtrar por "se trabaja" es cosa del kiosco, no de esta vista.
      getDayAssignments(supabase, dateISO, sucursalIds),
      marksQuery.returns<MarkDbRow[]>(),
      rosterQuery.returns<{ lab_id: number }[]>(),
    ])

  if (!assignments.ok) {
    return { ok: false, error: assignments.error }
  }

  if (errMarks) {
    return { ok: false, error: 'No se pudieron cargar las marcas del día.' }
  }

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
    return { ok: false, error: 'No se pudo cargar la programación del día.' }
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

  // Con varios tramos el mismo dia (SGRH-110: uno por sucursal) la fila
  // muestra el que empieza primero: es contra el que se mide la entrada.
  const assignmentByHistoryId = new Map<number, DayAssignment>()
  // Todos los tramos del dia: de ahi sale cuando empieza el segundo bloque.
  const assignmentsByHistoryId = new Map<number, DayAssignment[]>()
  for (const a of assignments.data) {
    const delDia = assignmentsByHistoryId.get(a.employmentHistoryId) ?? []
    delDia.push(a)
    assignmentsByHistoryId.set(a.employmentHistoryId, delDia)

    const previo = assignmentByHistoryId.get(a.employmentHistoryId)
    const empiezaAntes =
      a.expectedStart !== null &&
      (previo?.expectedStart == null || a.expectedStart < previo.expectedStart)
    if (!previo || empiezaAntes) assignmentByHistoryId.set(a.employmentHistoryId, a)
  }

  const marksByHistoryId = new Map<number, DailyRawMark[]>()
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

    const rawMark: DailyRawMark = {
      id: m.mar_id,
      tipo: parsedTipo.data,
      fechaHora: m.mar_fecha_hora,
      branchId: m.mar_sucursal_id,
    }
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

  // Catalogo de tipos de tardia de la empresa (pedido al inicio): define
  // desde que minuto hay tardanza y de que tipo es cada una.
  if (!tiposResult.ok) {
    return { ok: false, error: tiposResult.error }
  }

  const tipos = tiposResult.data

  const [{ data: ausencias }, fotoUrls, { data: justificacionesBloque }] = await Promise.all([
    // Ausencias aprobadas que cubren el dia. Leerlas exige AUSENCIAS_READ,
    // que tienen todos los roles que ven este panel; sin el, RLS devuelve cero
    // filas y el panel se ve como antes. Un error tampoco tumba el panel: es un
    // dato de contexto, las marcas siguen siendo lo principal.
    supabase
      .from('sgrh_ausencias')
      .select('aus_historial_laboral_id, sgrh_cat_tipos_ausencia ( tau_nombre, tau_es_intradia )')
      .in(
        'aus_historial_laboral_id',
        employmentHistory.map((h) => h.lab_id)
      )
      .eq('aus_estado', 'aprobada')
      .lte('aus_fecha_inicio', dateISO)
      .gte('aus_fecha_fin', dateISO)
      .returns<AusenciaDelDiaRow[]>(),
    // Una sola firma para toda la jornada (ver signEmployeePhotos).
    signEmployeePhotos(employmentHistory.map((h) => h.sgrh_empleados?.emp_foto_path)),
    // 2.º bloque justificado sin goce (SGRH-120): no crea ausencia, pero el
    // estado del dia tiene que dejar de pedir que alguien haga algo. Mismo
    // criterio que las ausencias: si falla, el panel sigue.
    supabase
      .from('sgrh_justificaciones_bloque')
      .select('jbl_historial_laboral_id')
      .in(
        'jbl_historial_laboral_id',
        employmentHistory.map((h) => h.lab_id)
      )
      .eq('jbl_fecha', dateISO)
      .eq('jbl_bloque', 2),
  ])

  const segundoBloqueJustificado = new Set(
    (justificacionesBloque ?? []).map((j) => j.jbl_historial_laboral_id)
  )

  const ausenciaByHistoryId = new Map<number, string>()
  for (const a of ausencias ?? []) {
    // Lactancia y demas intradia no cubren el dia: se trabaja igual.
    if (!a.sgrh_cat_tipos_ausencia || a.sgrh_cat_tipos_ausencia.tau_es_intradia) continue
    if (!ausenciaByHistoryId.has(a.aus_historial_laboral_id)) {
      ausenciaByHistoryId.set(a.aus_historial_laboral_id, a.sgrh_cat_tipos_ausencia.tau_nombre)
    }
  }

  const built: Omit<DailyAttendanceRow, 'status'>[] = employmentHistory.map((h) => {
    const employee = h.sgrh_empleados
    const fullName = employee
      ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
      : 'Sin nombre'

    const assignment = assignmentByHistoryId.get(h.lab_id)

    const marksForDay = marksByHistoryId.get(h.lab_id) ?? []
    const journey = groupIntoDayJourney(marksForDay, { byBlocks: true })
    const dayAssignments = assignmentsByHistoryId.get(h.lab_id) ?? []
    const scheduledBlocks = scheduledBlocksOf(dayAssignments)
    const hasSplitSchedule = scheduledBlocks.length === 2
    const blockJourneys = hasSplitSchedule ? splitBlockMarks(scheduledBlocks, marksForDay) : []

    // Cada marca se compara contra SU hora programada: la entrada contra la
    // entrada y el receso contra el suyo (SGRH-88). La salida sigue sin
    // comparacion — nadie definio todavia que es "salir tarde" — y el
    // almuerzo tampoco tiene hora programada que respetar (SGRH-95).
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
    const inicioAlmuerzo = markInfo(journey.inicioAlmuerzo, null)

    // El almuerzo se toma a cualquier hora; lo que cuenta es que no pase de
    // su hora, contada desde que se marco el inicio (SGRH-95).
    const finAlmuerzoBase = markInfo(journey.finAlmuerzo, null)
    const finAlmuerzo = finAlmuerzoBase && {
      ...finAlmuerzoBase,
      // Contra el limite del regreso: una hora despues del inicio marcado.
      diffMinutes: inicioAlmuerzo
        ? diffMinutes(finAlmuerzoBase.time, inicioAlmuerzo.time) - LUNCH_MINUTES
        : null,
    }

    // El segundo bloque se mide contra su propia hora: la entrada de la tarde
    // contra la de la tarde, no contra la de la manana (SGRH-110). Sin dia
    // partido no hay segunda entrada y esto queda en null.
    const segundoBloque =
      (hasSplitSchedule ? blockJourneys[1].entrada : journey.blocks[1]?.entrada) ?? null
    const segundaEntradaEsperada = secondBlockStart(
      dayAssignments
        .filter((a) => !a.isDayOff && !a.isHoliday)
        .flatMap((a) => [a.expectedStart, a.expectedSecondBlockStart])
    )
    const segundaEntrada = markInfo(segundoBloque, segundaEntradaEsperada)

    const tardiness = noSeTrabaja
      ? null
      : tardinessOf(entrada, journey.entrada, tipos, justificacionByMarkId)
    const secondBlockTardiness = noSeTrabaja
      ? null
      : tardinessOf(segundaEntrada, segundoBloque, tipos, justificacionByMarkId)
    const lunchTardiness = noSeTrabaja
      ? null
      : tardinessOf(finAlmuerzo, journey.finAlmuerzo, tipos, justificacionByMarkId)

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
      ausencia: ausenciaByHistoryId.get(h.lab_id) ?? null,
      expectedStart: assignment?.expectedStart ?? null,
      entrada,
      inicioReceso,
      finReceso,
      inicioAlmuerzo,
      finAlmuerzo,
      salida: markInfo(journey.salida, null),
      isSecondBlockJustified: segundoBloqueJustificado.has(h.lab_id),
      scheduledBlocks: scheduledBlocks.map((block, index) => {
        const marks = hasSplitSchedule ? blockJourneys[index] : index === 0 ? journey : null
        return {
          ...block,
          entrada: markInfo(marks?.entrada ?? null, block.inicio),
          salida: markInfo(marks?.salida ?? null, null),
        }
      }),
      blocks: journey.blocks.map((b, i) => ({
        entrada:
          i === 1 && segundaEntrada
            ? segundaEntrada
            : { id: b.entrada.id, time: timeOfDay(b.entrada.fechaHora), diffMinutes: null },
        salida: markInfo(b.salida, null),
      })),
      duplicateMarksCount: hasSplitSchedule
        ? journey.duplicates.filter((mark) => mark.tipo !== 'entrada' && mark.tipo !== 'salida')
            .length + blockJourneys.reduce((count, block) => count + block.duplicates.length, 0)
        : journey.duplicates.length,
      isOpen: hasSplitSchedule ? blockJourneys.some((block) => block.isOpen) : journey.isOpen,
      tardiness,
      lunchTardiness,
      secondBlockTardiness,
      lunchExcessMinutes:
        inicioAlmuerzo && finAlmuerzo
          ? periodExcessMinutes(inicioAlmuerzo.time, finAlmuerzo.time, LUNCH_MINUTES)
          : null,
      // El receso se mide contra los minutos pagados, con o sin receso
      // programado: es la regla con que la matriz semanal calcula las horas.
      breakExcessMinutes:
        inicioReceso && finReceso
          ? periodExcessMinutes(inicioReceso.time, finReceso.time, PAID_BREAK_MINUTES)
          : null,
    }
  })

  // El estado de cada persona, con la misma regla que el dashboard: hoy se
  // mide contra la hora actual; un dia pasado ya termino.
  const today = todayInCostaRica()
  const clock: DayClock =
    dateISO === today
      ? { when: 'today', nowTime: timeOfDay(nowInCostaRica()) }
      : dateISO < today
        ? { when: 'past' }
        : { when: 'future' }
  const data: DailyAttendanceRow[] = built.map((row) => ({
    ...row,
    status: attendanceStatusOf(row, clock, tipos),
  }))

  data.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, date: dateISO, data }
}
