'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getUsuarioSucursalScope } from '@/lib/empresa/get-usuario-sucursales'
import { getDayAssignments, isWorkable } from '@/modules/attendance/lib/workingDay'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import type { ActiveEmployeeOption } from '@/modules/attendance/actions/getActiveEmployees'

interface EmployeeJoin {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_fecha_nacimiento: string | null
}

interface HistorialRow {
  sgrh_empleados: EmployeeJoin | null
}

export type GetScheduledEmployeesResult =
  { ok: true; data: ActiveEmployeeOption[] } | { ok: false; error: string }

/**
 * Quienes trabajan HOY en la sucursal de este kiosco: la lista de la pantalla
 * de marcaje.
 *
 * Es deliberadamente distinta de getActiveEmployees, que sigue devolviendo la
 * plantilla completa de la sucursal y alimenta el enrolamiento facial —
 * enrolar a alguien es una tarea de configuracion que no tiene por que
 * esperar a que le toque turno.
 *
 * Arranca desde la programacion del dia (ver lib/workingDay.ts) y recien
 * despues busca el expediente. Antes el kiosco listaba por lab_sucursal_id, y
 * desde SGRH-84 eso dejaba fuera a quien el gerente hubiera trasladado a esta
 * tienda ese dia: no aparecia en el selector, la camara no lo tenia entre los
 * candidatos, y se quedaba sin poder marcar.
 *
 * Quien no esta programado hoy tampoco aparece: no debe poder marcar
 * (decision del cliente, 2026-09-17), y en un dispositivo fisicamente
 * expuesto no hay razon para exhibir a gente que hoy no trabaja aca. La lista
 * es solo la mitad visible de la regla — la guarda de verdad esta en
 * registerKioskMark, que es invocable sin pasar por esta pantalla.
 *
 * Si el kiosco no tiene sucursal asignada es un error de configuracion: no se
 * debe caer de vuelta a "mostrar toda la empresa" en un dispositivo expuesto.
 *
 * Acepta ASISTENCIA_KIOSCO (el permiso estrecho del rol KIOSCO) o
 * EMPLEADOS_READ (gerentes y RRHH, que ven la misma pantalla).
 */
export async function getScheduledEmployees(): Promise<GetScheduledEmployeesResult> {
  const claims = await requireAnyPermission([PERMISOS.ASISTENCIA_KIOSCO, PERMISOS.EMPLEADOS_READ])
  const meta = claims.app_metadata as {
    usr_id?: number
    empresa_id?: number
    sucursal_ids?: number[] | null
  }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const supabase = await createClient()

  // La sucursal deberia viajar en el JWT (custom_access_token_hook la toma de
  // uer_sucursal_id), pero la version del hook que corre hoy en la base no
  // emite ese claim. Mientras no se actualice se resuelve por consulta, igual
  // que verifyFace y registerKioskMark. No debilita el alcance: la RLS de
  // uer_select solo deja leer la asignacion PROPIA.
  let sucursalIds = meta.sucursal_ids ?? null

  if (!sucursalIds && meta.usr_id) {
    sucursalIds = await getUsuarioSucursalScope(supabase, meta.usr_id)
  }

  if (!sucursalIds || sucursalIds.length === 0) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  const assignments = await getDayAssignments(supabase, todayInCostaRica(), sucursalIds)

  if (!assignments.ok) {
    return { ok: false, error: assignments.error }
  }

  const historyIds = assignments.data.filter(isWorkable).map((a) => a.employmentHistoryId)

  // Que hoy no trabaje nadie aca no es un error de configuracion: un domingo
  // cerrado es exactamente esto. Lista vacia, y el kiosco lo dice a su manera.
  if (historyIds.length === 0) {
    return { ok: true, data: [] }
  }

  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_fecha_nacimiento )
    `
    )
    // El cruce contra el historial no es solo para traer el nombre: acota por
    // empresa y descarta contratos ya cerrados. La programacion queda como
    // historico y sobrevive a la salida del colaborador, asi que sin este
    // filtro un ex-empleado con el dia ya programado seguiria en el kiosco.
    .in('lab_id', historyIds)
    .eq('lab_empresa_id', meta.empresa_id)
    .is('lab_fecha_fin', null)
    .returns<HistorialRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los colaboradores.' }
  }

  const seen = new Set<number>()
  const options: ActiveEmployeeOption[] = []

  for (const row of data) {
    const employee = row.sgrh_empleados
    if (!employee || seen.has(employee.emp_id)) continue
    seen.add(employee.emp_id)

    options.push({
      employeeId: employee.emp_id,
      fullName: `${employee.emp_nombre} ${employee.emp_apellido_1}${employee.emp_apellido_2 ? ' ' + employee.emp_apellido_2 : ''}`,
      birthDateISO: employee.emp_fecha_nacimiento,
    })
  }

  options.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))

  return { ok: true, data: options }
}
