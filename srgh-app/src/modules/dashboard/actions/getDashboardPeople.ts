'use server'

import { createClient } from '@/lib/supabase/server'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { fullName } from '@/modules/employees/lib/format'
import {
  toRecentHires,
  toUpcomingAnniversaries,
  toUpcomingBirthdays,
  type RecentHire,
  type UpcomingAnniversary,
  type UpcomingBirthday,
} from '@/modules/dashboard/lib/birthdays'
import type { SgrhJwtClaims } from '@/types/auth'

interface EmpleadoRow {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_fecha_nacimiento: string | null
  emp_fecha_ingreso_original: string | null
  emp_foto_path: string | null
}

interface HistorialActivoRow {
  lab_empleado_id: number
  sgrh_cat_puestos: { pue_nombre: string | null } | null
  sgrh_sucursales: { suc_nombre: string | null } | null
}

export interface DashboardPeople {
  /**
   * false when the session cannot read employees: the dashboard is open to
   * every role, the employee file is not. The panels then explain themselves
   * instead of showing an empty list that looks like "nobody".
   */
  canSee: boolean
  /** Sorted from the closest to the farthest. Never carries the birth year. */
  birthdays: UpcomingBirthday[]
  /** Next work anniversary of each person, closest first. */
  anniversaries: UpcomingAnniversary[]
  /** Active headcount per branch, largest first. */
  team: { sucursal: string; count: number }[]
  /** Who joined in the last NEW_HIRE_WINDOW_DAYS, newest first. */
  newHires: RecentHire[]
  /** Employees with a contract in force. */
  activeCount: number
  /** Costa Rica calendar day the countdowns were computed against. */
  todayIso: string
}

const SIN_SUCURSAL = 'Sin sucursal'
const NEW_HIRE_WINDOW_DAYS = 60

/**
 * Everything the dashboard shows about the people of the company —birthdays,
 * work anniversaries and headcount per branch— from ONE pair of queries: the
 * three panels read the same employees and the same contracts in force.
 *
 * Unlike the rest of the actions this one does NOT redirect when the
 * permission is missing: /dashboard is the landing page of every role, so it
 * degrades to `canSee: false` and the rest of the page still renders. A query
 * error degrades the same way — a summary must never take the landing page
 * down.
 */
export async function getDashboardPeople(): Promise<DashboardPeople> {
  const todayIso = todayInCostaRica()
  const hidden: DashboardPeople = {
    canSee: false,
    birthdays: [],
    anniversaries: [],
    team: [],
    newHires: [],
    activeCount: 0,
    todayIso,
  }

  const supabase = await createClient()
  const { data: session } = await supabase.auth.getClaims()
  const meta = (session?.claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const permisos = Array.isArray(meta.permisos) ? meta.permisos : []

  if (!meta.empresa_id || !permisos.includes(PERMISOS.EMPLEADOS_READ)) {
    return hidden
  }

  const [{ data: empleados, error: errEmpleados }, { data: historiales, error: errHistorial }] =
    await Promise.all([
      supabase
        .from('sgrh_empleados')
        .select(
          'emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_fecha_nacimiento, emp_fecha_ingreso_original, emp_foto_path'
        )
        .returns<EmpleadoRow[]>(),
      supabase
        .from('sgrh_historial_laboral')
        .select('lab_empleado_id, sgrh_cat_puestos ( pue_nombre ), sgrh_sucursales ( suc_nombre )')
        .eq('lab_empresa_id', meta.empresa_id)
        .is('lab_fecha_fin', null)
        .returns<HistorialActivoRow[]>(),
    ])

  if (errEmpleados || errHistorial) {
    return hidden
  }

  const contratoPorEmpleado = new Map<number, HistorialActivoRow>()
  for (const historial of historiales ?? []) {
    contratoPorEmpleado.set(historial.lab_empleado_id, historial)
  }

  /* Only people who still work here: a former employee's birthday is noise. */
  const activos = (empleados ?? []).filter((empleado) => contratoPorEmpleado.has(empleado.emp_id))

  /* Signed in one batch, and never fatal (same criterion as getEmployees). */
  const paths = activos
    .map((empleado) => empleado.emp_foto_path)
    .filter((path): path is string => Boolean(path))
  let fotoUrls: Record<string, string> = {}
  if (paths.length > 0) {
    const signed = await getStorageProvider().getSignedUrls('FOTOS_EMPLEADO', paths, TTL_FOTO)
    if (signed.ok) fotoUrls = signed.data
  }

  const people = activos.map((empleado) => {
    const contrato = contratoPorEmpleado.get(empleado.emp_id)
    return {
      id: empleado.emp_id,
      nombre: fullName(empleado),
      puesto: contrato?.sgrh_cat_puestos?.pue_nombre ?? null,
      sucursal: contrato?.sgrh_sucursales?.suc_nombre ?? null,
      fotoUrl: empleado.emp_foto_path ? (fotoUrls[empleado.emp_foto_path] ?? null) : null,
      fechaNacimiento: empleado.emp_fecha_nacimiento,
      fechaIngreso: empleado.emp_fecha_ingreso_original,
    }
  })

  const headcount = new Map<string, number>()
  for (const person of people) {
    const sucursal = person.sucursal ?? SIN_SUCURSAL
    headcount.set(sucursal, (headcount.get(sucursal) ?? 0) + 1)
  }

  const withJoinDate = people.flatMap((person) =>
    person.fechaIngreso ? [{ ...person, fechaIngreso: person.fechaIngreso }] : []
  )

  return {
    canSee: true,
    birthdays: toUpcomingBirthdays(
      people.flatMap((person) =>
        person.fechaNacimiento ? [{ ...person, fechaNacimiento: person.fechaNacimiento }] : []
      ),
      todayIso
    ),
    anniversaries: toUpcomingAnniversaries(withJoinDate, todayIso),
    newHires: toRecentHires(withJoinDate, todayIso, NEW_HIRE_WINDOW_DAYS),
    team: Array.from(headcount, ([sucursal, count]) => ({ sucursal, count })).sort(
      (a, b) => b.count - a.count || a.sucursal.localeCompare(b.sucursal)
    ),
    activeCount: people.length,
    todayIso,
  }
}
