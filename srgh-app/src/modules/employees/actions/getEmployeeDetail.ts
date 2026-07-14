'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { Database } from '@/types/database.types'
import type { EmpleadoDetalle } from '@/modules/employees/types'

type EmpleadoRow = Database['public']['Tables']['sgrh_empleados']['Row']
type HistorialRow = Database['public']['Tables']['sgrh_historial_laboral']['Row']

type EmpleadoQueryRow = EmpleadoRow & {
  sgrh_cat_tipos_identificacion: { tid_nombre: string } | null
}

type HistorialQueryRow = HistorialRow & {
  sgrh_cat_puestos: { pue_nombre: string } | null
  sgrh_sucursales: { suc_nombre: string } | null
  sgrh_cat_tipos_contrato: { tco_nombre: string } | null
  sgrh_cat_tipos_jornada: { tjo_nombre: string } | null
}

export type GetEmployeeDetailResult =
  { ok: true; data: EmpleadoDetalle } | { ok: false; error: string; notFound?: boolean }

/** Ficha completa del empleado + su contrato vigente (si existe). */
export async function getEmployeeDetail(empId: number): Promise<GetEmployeeDetailResult> {
  if (!Number.isInteger(empId) || empId <= 0) {
    return { ok: false, error: 'Empleado no encontrado.', notFound: true }
  }

  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const supabase = await createClient()

  const { data: empleado, error: errEmpleado } = await supabase
    .from('sgrh_empleados')
    .select('*, sgrh_cat_tipos_identificacion ( tid_nombre )')
    .eq('emp_id', empId)
    .maybeSingle<EmpleadoQueryRow>()

  if (errEmpleado) {
    return { ok: false, error: 'No se pudo cargar el empleado.' }
  }

  if (!empleado) {
    return { ok: false, error: 'Empleado no encontrado.', notFound: true }
  }

  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      *,
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre ),
      sgrh_cat_tipos_contrato ( tco_nombre ),
      sgrh_cat_tipos_jornada ( tjo_nombre )
    `
    )
    .eq('lab_empleado_id', empId)
    .eq('lab_empresa_id', empresaId)
    .is('lab_fecha_fin', null)
    .maybeSingle<HistorialQueryRow>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudo cargar el contrato vigente.' }
  }

  // La RLS de esta tabla decide el acceso: si el rol no tiene NOMINA_READ ni
  // EMPLEADOS_WRITE (y no es el propio empleado), simplemente no hay fila.
  const { data: datosPago, error: errPago } = await supabase
    .from('sgrh_empleado_datos_pago')
    .select('edp_banco, edp_tipo_cuenta, edp_numero_cuenta')
    .eq('edp_empleado_id', empId)
    .maybeSingle()

  if (errPago) {
    return { ok: false, error: 'No se pudieron cargar los datos de pago.' }
  }

  const { sgrh_cat_tipos_identificacion, ...empleadoBase } = empleado

  let historialActivo: EmpleadoDetalle['historial_activo'] = null
  if (historial) {
    const {
      sgrh_cat_puestos,
      sgrh_sucursales,
      sgrh_cat_tipos_contrato,
      sgrh_cat_tipos_jornada,
      ...historialBase
    } = historial

    historialActivo = {
      ...historialBase,
      puesto_nombre: sgrh_cat_puestos?.pue_nombre ?? '—',
      sucursal_nombre: sgrh_sucursales?.suc_nombre ?? '—',
      tipo_contrato_nombre: sgrh_cat_tipos_contrato?.tco_nombre ?? '—',
      tipo_jornada_nombre: sgrh_cat_tipos_jornada?.tjo_nombre ?? '—',
    }
  }

  const data: EmpleadoDetalle = {
    ...empleadoBase,
    tipo_identificacion_nombre: sgrh_cat_tipos_identificacion?.tid_nombre ?? '—',
    historial_activo: historialActivo,
    datos_pago: datosPago ?? null,
  }

  return { ok: true, data }
}
