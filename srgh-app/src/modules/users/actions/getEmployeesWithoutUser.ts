'use server'

import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { EmpleadoSinUsuario } from '@/modules/users/types'

interface HistorialActivoRow {
  lab_empleado_id: number
  sgrh_empleados: {
    emp_id: number
    emp_nombre: string
    emp_apellido_1: string
    emp_apellido_2: string | null
    emp_email_personal: string | null
  } | null
  sgrh_cat_puestos: { pue_nombre: string | null } | null
}

export type GetEmployeesWithoutUserResult =
  { ok: true; data: EmpleadoSinUsuario[] } | { ok: false; error: string }

/**
 * Empleados con contrato vigente que aún no tienen cuenta de usuario, para el
 * bloque de invitación precargada. Los vínculos existentes se leen con el
 * cliente admin: si RLS ocultara alguna fila de sgrh_usuarios, el empleado
 * aparecería como "sin usuario" y la invitación fallaría después.
 */
export async function getEmployeesWithoutUser(): Promise<GetEmployeesWithoutUserResult> {
  const claims = await requirePermission(PERMISOS.USUARIOS_WRITE)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: historiales, error: histError } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_empleado_id,
      sgrh_empleados (
        emp_id,
        emp_nombre,
        emp_apellido_1,
        emp_apellido_2,
        emp_email_personal
      ),
      sgrh_cat_puestos ( pue_nombre )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .returns<HistorialActivoRow[]>()

  if (histError) {
    return { ok: false, error: 'No se pudieron cargar los empleados activos.' }
  }

  const admin = createAdminClient()
  const { data: vinculados, error: vincError } = await admin
    .from('sgrh_usuarios')
    .select('usr_empleado_id')
    .not('usr_empleado_id', 'is', null)

  if (vincError) {
    return { ok: false, error: 'No se pudieron verificar los usuarios existentes.' }
  }

  const idsVinculados = new Set((vinculados ?? []).map((v) => v.usr_empleado_id))

  const porEmpleado = new Map<number, EmpleadoSinUsuario>()
  for (const historial of historiales ?? []) {
    const empleado = historial.sgrh_empleados
    if (!empleado || idsVinculados.has(empleado.emp_id) || porEmpleado.has(empleado.emp_id)) {
      continue
    }
    porEmpleado.set(empleado.emp_id, {
      emp_id: empleado.emp_id,
      nombre_completo: [empleado.emp_nombre, empleado.emp_apellido_1, empleado.emp_apellido_2]
        .filter(Boolean)
        .join(' '),
      email_personal: empleado.emp_email_personal,
      puesto_nombre: historial.sgrh_cat_puestos?.pue_nombre ?? null,
    })
  }

  const data = [...porEmpleado.values()].sort((a, b) =>
    a.nombre_completo.localeCompare(b.nombre_completo)
  )

  return { ok: true, data }
}
