'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { EmpleadoListItem } from '@/modules/employees/types'

interface EmpleadoQueryRow {
  emp_id: number
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
  emp_numero_identificacion: string
  emp_telefono: string | null
  emp_email_personal: string | null
  emp_fecha_ingreso_original: string
  emp_genero: string | null
  emp_nacionalidad: string
}

interface HistorialActivoRow {
  lab_empleado_id: number
  lab_fecha_inicio: string
  lab_salario_base: number
  sgrh_cat_puestos: { pue_nombre: string | null } | null
  sgrh_sucursales: { suc_nombre: string | null } | null
  sgrh_cat_tipos_contrato: { tco_nombre: string | null } | null
}

export type GetEmployeesResult =
  { ok: true; data: EmpleadoListItem[] } | { ok: false; error: string }

/**
 * Lista de empleados con su contrato vigente (si existe). RLS ya limita las
 * filas visibles a la empresa del usuario; el filtro de empresa en el historial
 * evita mezclar contratos de otras empresas para empleados compartidos.
 */
export async function getEmployees(): Promise<GetEmployeesResult> {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: empleados, error: errEmpleados } = await supabase
    .from('sgrh_empleados')
    .select(
      `
      emp_id,
      emp_nombre,
      emp_apellido_1,
      emp_apellido_2,
      emp_numero_identificacion,
      emp_telefono,
      emp_email_personal,
      emp_fecha_ingreso_original,
      emp_genero,
      emp_nacionalidad
    `
    )
    .order('emp_apellido_1', { ascending: true })
    .returns<EmpleadoQueryRow[]>()

  if (errEmpleados) {
    return { ok: false, error: 'No se pudieron cargar los empleados.' }
  }

  const { data: historiales, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      lab_empleado_id,
      lab_fecha_inicio,
      lab_salario_base,
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre ),
      sgrh_cat_tipos_contrato ( tco_nombre )
    `
    )
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .returns<HistorialActivoRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudieron cargar los contratos vigentes.' }
  }

  const historialPorEmpleado = new Map<number, HistorialActivoRow>()
  for (const historial of historiales ?? []) {
    historialPorEmpleado.set(historial.lab_empleado_id, historial)
  }

  const data: EmpleadoListItem[] = (empleados ?? []).map((empleado) => {
    const historial = historialPorEmpleado.get(empleado.emp_id)

    return {
      ...empleado,
      puesto_nombre: historial?.sgrh_cat_puestos?.pue_nombre ?? null,
      sucursal_nombre: historial?.sgrh_sucursales?.suc_nombre ?? null,
      tipo_contrato_nombre: historial?.sgrh_cat_tipos_contrato?.tco_nombre ?? null,
      salario_base: historial?.lab_salario_base ?? null,
      fecha_inicio_contrato: historial?.lab_fecha_inicio ?? null,
      activo: Boolean(historial),
    }
  })

  return { ok: true, data }
}
