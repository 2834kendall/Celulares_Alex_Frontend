'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

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

export interface ActiveEmployeeOption {
  employeeId: number
  fullName: string
  /** Solo para validar el PIN de respaldo — nunca se muestra en el kiosco. */
  birthDateISO: string | null
}

export type GetActiveEmployeesResult =
  { ok: true; data: ActiveEmployeeOption[] } | { ok: false; error: string }

/**
 * Lista de empleados con contrato activo en la sucursal DEL KIOSCO — no toda
 * la empresa. Si el kiosco no tiene sucursal asignada es un error de
 * configuracion: no se debe caer de vuelta a "mostrar toda la empresa" en un
 * dispositivo fisicamente expuesto.
 *
 * Acepta ASISTENCIA_KIOSCO (el permiso estrecho del rol KIOSCO) o
 * EMPLEADOS_READ (gerentes y RRHH, que ven la misma pantalla). KIOSCO ya NO
 * tiene EMPLEADOS_READ: con ese permiso la RLS le dejaba leer el expediente
 * completo de toda la empresa.
 */
export async function getActiveEmployees(): Promise<GetActiveEmployeesResult> {
  const claims = await requireAnyPermission([PERMISOS.ASISTENCIA_KIOSCO, PERMISOS.EMPLEADOS_READ])
  const meta = claims.app_metadata as { empresa_id?: number; sucursal_id?: number | null }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  // La sucursal viaja en el JWT (custom_access_token_hook la toma de
  // uer_sucursal_id). Antes se resolvia con una consulta extra por llamada.
  const sucursalId = meta.sucursal_id ?? null

  if (sucursalId === null) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      sgrh_empleados ( emp_id, emp_nombre, emp_apellido_1, emp_apellido_2, emp_fecha_nacimiento )
    `
    )
    .eq('lab_empresa_id', meta.empresa_id)
    .eq('lab_sucursal_id', sucursalId)
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
