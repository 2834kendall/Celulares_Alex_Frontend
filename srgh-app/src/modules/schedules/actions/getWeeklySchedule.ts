'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getWeekDates } from '@/modules/schedules/lib/week'
import { hoursBetween, templateHours } from '@/modules/schedules/lib/hours'
import { compareByStart } from '@/modules/schedules/lib/dayAssignment'
import { signEmployeePhotos } from '@/lib/storage/employee-photos'
import { formatSucursalLabel, sucursalLabel } from '@/lib/empresa/marca-label'

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

interface BranchJoin {
  suc_id: number
  suc_nombre: string
  sgrh_marcas_comerciales?: { mco_nombre: string } | null
}

interface EmploymentHistoryRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  sgrh_empleados: EmployeeJoin | null
  sgrh_cat_puestos: PositionJoin | null
  sgrh_sucursales: BranchJoin | null
}

interface ScheduleJoin {
  hor_id: number
  hor_nombre: string
  hor_hora_entrada: string
  hor_hora_salida: string
  hor_hora_inicio_almuerzo: string
  hor_hora_fin_almuerzo: string
  hor_hora_inicio_break: string | null
  hor_hora_fin_break: string | null
  hor_hora_entrada_2: string | null
  hor_hora_salida_2: string | null
}

interface AssignmentRow {
  prg_id: number
  prg_historial_laboral_id: number
  prg_fecha: string
  prg_es_dia_libre: boolean
  prg_horario_id: number | null
  prg_sucursal_id: number
  sgrh_sucursales: BranchJoin | null
  sgrh_cat_horarios: ScheduleJoin | null
  prg_hora_entrada_custom: string | null
  prg_hora_salida_custom: string | null
  prg_hora_inicio_almuerzo_custom: string | null
  prg_hora_fin_almuerzo_custom: string | null
  prg_hora_inicio_break_custom: string | null
  prg_hora_fin_break_custom: string | null
}

export interface DayAssignment {
  date: string
  assignmentId: number | null
  scheduleId: number | null
  scheduleName: string | null
  startTime: string | null
  endTime: string | null
  isDayOff: boolean
  hours: number
  // Sucursal real del dia, puede diferir de la de casa del empleado.
  branchId: number
  branchName: string | null
  /**
   * Segundo bloque del dia cuando la plantilla es una jornada partida (por ejemplo
   * 7-11 y 16-20). Sigue siendo UN tramo en UNA sucursal: startTime/endTime son el
   * primer bloque. null cuando no hay segundo bloque o el tramo es personalizado.
   */
  secondStartTime?: string | null
  secondEndTime?: string | null
  customStartTime?: string | null
  customEndTime?: string | null
  customLunchStart?: string | null
  customLunchEnd?: string | null
  customBreakStart?: string | null
  customBreakEnd?: string | null
  /**
   * Los demás tramos del día, cuando se trabaja en más de una sucursal (SGRH-110):
   * por ejemplo 8–12 en una tienda y 13–17 en otra. Los campos de arriba describen
   * el PRIMER tramo (el que empieza antes); cada elemento de acá describe otro, con
   * la misma forma. Ausente cuando el día tiene un solo tramo, que es lo normal.
   */
  extraTramos?: DayAssignment[]
}

export interface EmployeeWeekRow {
  employmentHistoryId: number
  employeeId: number
  // Sucursal de casa (contrato), default de dias sin asignacion propia.
  branchId: number
  branchName: string | null
  fullName: string
  /** URL firmada de la foto, o null si no tiene (el Avatar cae a iniciales). */
  fotoUrl: string | null
  position: string | null
  days: DayAssignment[]
  /** Horas de la semana, sumando todos los tramos de cada dia. */
  weeklyTotal: number
}

export interface SucursalOption {
  id: number
  nombre: string
}

/**
 * Postgres devuelve las horas con segundos y las acciones de escritura exigen HH:mm:
 * sin esto, mover de tienda o pegar un dia con horas personalizadas se rechazaba con
 * "Datos de asignacion invalidos".
 */
function sinSegundos(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : hora
}

/** Hora de inicio del tramo: la propia si trae entrada y salida, y si no la de la plantilla. */
function startOf(assignment: AssignmentRow): string | null {
  const isCustom = Boolean(assignment.prg_hora_entrada_custom && assignment.prg_hora_salida_custom)
  return isCustom
    ? assignment.prg_hora_entrada_custom
    : (assignment.sgrh_cat_horarios?.hor_hora_entrada ?? null)
}

/** Un tramo (una fila de programacion) con sus horas calculadas. */
function toDayAssignment(date: string, assignment: AssignmentRow): DayAssignment {
  const schedule = assignment.sgrh_cat_horarios
  const isCustom = Boolean(assignment.prg_hora_entrada_custom && assignment.prg_hora_salida_custom)
  let hours = 0

  if (!assignment.prg_es_dia_libre) {
    if (isCustom) {
      hours = hoursBetween(
        assignment.prg_hora_entrada_custom!,
        assignment.prg_hora_salida_custom!,
        assignment.prg_hora_inicio_almuerzo_custom,
        assignment.prg_hora_fin_almuerzo_custom,
        assignment.prg_hora_inicio_break_custom,
        assignment.prg_hora_fin_break_custom
      )
    } else if (schedule) {
      hours = templateHours(schedule)
    }
  }

  return {
    date,
    assignmentId: assignment.prg_id,
    scheduleId: assignment.prg_horario_id,
    scheduleName: schedule?.hor_nombre ?? null,
    startTime: isCustom ? assignment.prg_hora_entrada_custom : (schedule?.hor_hora_entrada ?? null),
    endTime: isCustom ? assignment.prg_hora_salida_custom : (schedule?.hor_hora_salida ?? null),
    secondStartTime: isCustom ? null : (schedule?.hor_hora_entrada_2 ?? null),
    secondEndTime: isCustom ? null : (schedule?.hor_hora_salida_2 ?? null),
    customStartTime: sinSegundos(assignment.prg_hora_entrada_custom),
    customEndTime: sinSegundos(assignment.prg_hora_salida_custom),
    customLunchStart: sinSegundos(assignment.prg_hora_inicio_almuerzo_custom),
    customLunchEnd: sinSegundos(assignment.prg_hora_fin_almuerzo_custom),
    customBreakStart: sinSegundos(assignment.prg_hora_inicio_break_custom),
    customBreakEnd: sinSegundos(assignment.prg_hora_fin_break_custom),
    isDayOff: assignment.prg_es_dia_libre,
    hours,
    branchId: assignment.prg_sucursal_id,
    branchName: sucursalLabel(assignment.sgrh_sucursales) ?? null,
  }
}

export type GetWeeklyScheduleResult =
  | { ok: true; weekDates: string[]; data: EmployeeWeekRow[]; sucursales: SucursalOption[] }
  | { ok: false; error: string }

export async function getWeeklySchedule(weekStartISO: string): Promise<GetWeeklyScheduleResult> {
  // RLS policies on sgrh_programacion_semanal require ASISTENCIA_READ.
  const claims = await requirePermission(PERMISOS.ASISTENCIA_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const filtro = await getFiltroMarca()
  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }

  const weekDates = getWeekDates(weekStartISO)
  const supabase = await createClient()

  // Colaboradores y sucursales no dependen entre si: van en paralelo (cada
  // viaje a Supabase cuesta ~200 ms desde CR).
  const [
    { data: employmentHistory, error: errHistory },
    { data: sucursalesRows, error: errSucursales },
  ] = await Promise.all([
    supabase
      .from('sgrh_historial_laboral')
      .select(
        `
      lab_id,
      lab_empleado_id,
      lab_sucursal_id,
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_foto_path ),
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) )
    `
      )
      .eq('lab_empresa_id', empresaId)
      .is('lab_fecha_fin', null)
      .returns<EmploymentHistoryRow[]>(),
    // Catalogo completo de sucursales de la empresa (no solo las de casa de los empleados).
    // La marca elegida NO lo acota: un dia se puede asignar en una tienda de otra marca.
    supabase
      .from('sgrh_sucursales')
      .select('suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_nombre )')
      .eq('suc_empresa_id', empresaId)
      .eq('suc_activa', true)
      .order('suc_nombre', { ascending: true })
      .returns<BranchJoin[]>(),
  ])

  if (errHistory) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  if (errSucursales) {
    return { ok: false, error: 'No se pudieron cargar las sucursales.' }
  }

  // Se ordena por lo que se muestra: así quedan juntas las de cada marca.
  const sucursales: SucursalOption[] = sucursalesRows
    .map((s) => ({
      id: s.suc_id,
      nombre: formatSucursalLabel(s.sgrh_marcas_comerciales?.mco_nombre, s.suc_nombre),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const employmentHistoryIds = employmentHistory.map((h) => h.lab_id)

  // La programacion y las fotos dependen de los colaboradores, no entre si.
  // Una sola firma para toda la matriz (ver signEmployeePhotos).
  const [{ data: assignments, error: errAssignments }, fotoUrls] = await Promise.all([
    employmentHistoryIds.length
      ? supabase
          .from('sgrh_programacion_semanal')
          .select(
            `
          prg_id,
          prg_historial_laboral_id,
          prg_fecha,
          prg_es_dia_libre,
          prg_horario_id,
          prg_sucursal_id,
          sgrh_sucursales ( suc_id, suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) ),
          sgrh_cat_horarios ( hor_id, hor_nombre, hor_hora_entrada, hor_hora_salida, hor_hora_inicio_almuerzo, hor_hora_fin_almuerzo, hor_hora_inicio_break, hor_hora_fin_break, hor_hora_entrada_2, hor_hora_salida_2 ),
            prg_hora_entrada_custom,
            prg_hora_salida_custom,
            prg_hora_inicio_almuerzo_custom,
            prg_hora_fin_almuerzo_custom,
            prg_hora_inicio_break_custom,
            prg_hora_fin_break_custom

        `
          )
          .in('prg_historial_laboral_id', employmentHistoryIds)
          .gte('prg_fecha', weekDates[0])
          .lte('prg_fecha', weekDates[6])
          .returns<AssignmentRow[]>()
      : Promise.resolve({ data: [] as AssignmentRow[], error: null }),
    signEmployeePhotos(employmentHistory.map((h) => h.sgrh_empleados?.emp_foto_path)),
  ])

  if (errAssignments) {
    return { ok: false, error: 'No se pudo cargar la programacion semanal.' }
  }

  // Index by employmentHistoryId+date to avoid a linear find() per cell. Una
  // celda puede tener varios tramos (SGRH-110): se guardan todos, y los de cada
  // día se ordenan por hora de inicio para que "el primero" sea estable.
  const assignmentsByCell = new Map<string, AssignmentRow[]>()
  for (const a of assignments ?? []) {
    const key = `${a.prg_historial_laboral_id}|${a.prg_fecha}`
    const cell = assignmentsByCell.get(key)
    if (cell) cell.push(a)
    else assignmentsByCell.set(key, [a])
  }
  for (const cell of assignmentsByCell.values()) {
    if (cell.length > 1) {
      cell.sort((a, b) => compareByStart(startOf(a), startOf(b)) || a.prg_id - b.prg_id)
    }
  }

  // Con una marca elegida: quien tiene la base en ella, o trabaja ahí algún día de la
  // semana (un turno prestado). Sin este segundo caso desaparecería de su tienda.
  const { sucursalIds } = filtro
  const contratosConTurno = new Set(
    sucursalIds
      ? (assignments ?? [])
          .filter((a) => sucursalIds.includes(a.prg_sucursal_id))
          .map((a) => a.prg_historial_laboral_id)
      : []
  )
  const visibles = sucursalIds
    ? employmentHistory.filter(
        (h) => sucursalIds.includes(h.lab_sucursal_id) || contratosConTurno.has(h.lab_id)
      )
    : employmentHistory

  const data: EmployeeWeekRow[] = visibles.map((h) => {
    const employee = h.sgrh_empleados
    const position = h.sgrh_cat_puestos
    const fullName = employee
      ? `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`
      : 'Sin nombre'

    let weeklyTotal = 0

    const days: DayAssignment[] = weekDates.map((date) => {
      const cell = assignmentsByCell.get(`${h.lab_id}|${date}`)

      if (!cell) {
        return {
          date,
          assignmentId: null,
          scheduleId: null,
          scheduleName: null,
          startTime: null,
          endTime: null,
          isDayOff: false,
          hours: 0,
          // Sin fila propia: el dia usa la sucursal de casa.
          branchId: h.lab_sucursal_id,
          branchName: sucursalLabel(h.sgrh_sucursales) ?? null,
        }
      }

      // El primer tramo describe el dia; los demas (SGRH-110) van en extraTramos.
      // El total semanal suma TODOS: quien parte el dia en dos tiendas trabaja
      // las horas de las dos.
      const tramos = cell.map((assignment) => toDayAssignment(date, assignment))
      for (const tramo of tramos) weeklyTotal += tramo.hours

      const [primero, ...extras] = tramos
      return extras.length > 0 ? { ...primero, extraTramos: extras } : primero
    })

    return {
      employmentHistoryId: h.lab_id,
      employeeId: h.lab_empleado_id,
      branchId: h.lab_sucursal_id,
      branchName: sucursalLabel(h.sgrh_sucursales) ?? null,
      fullName,
      // emp_foto_path nunca cruza al cliente: solo la URL firmada opaca.
      fotoUrl: employee?.emp_foto_path ? (fotoUrls[employee.emp_foto_path] ?? null) : null,
      position: position?.pue_nombre ?? null,
      days,
      weeklyTotal,
    }
  })

  return { ok: true, weekDates, data, sucursales }
}
