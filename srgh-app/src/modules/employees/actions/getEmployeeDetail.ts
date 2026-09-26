'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import { decryptField } from '@/lib/crypto/fieldCrypto'
import type { Database } from '@/types/database.types'
import type { ContratoDetalle, EmpleadoDetalle } from '@/modules/employees/types'

type EmpleadoRow = Database['public']['Tables']['sgrh_empleados']['Row']
type HistorialRow = Database['public']['Tables']['sgrh_historial_laboral']['Row']

type DireccionQueryRow = {
  dir_distrito_id: number
  dir_codigo_postal: string
  dir_senas_exactas: string | null
  sgrh_cat_distritos: {
    dis_nombre: string
    sgrh_cat_cantones: {
      can_nombre: string
      sgrh_cat_provincias: { prv_nombre: string } | null
    } | null
  } | null
}

type EmpleadoQueryRow = EmpleadoRow & {
  sgrh_cat_tipos_identificacion: { tid_nombre: string } | null
  sgrh_direcciones: DireccionQueryRow | null
}

type HistorialQueryRow = HistorialRow & {
  sgrh_cat_puestos: { pue_nombre: string } | null
  sgrh_sucursales: { suc_nombre: string } | null
  sgrh_cat_tipos_contrato: { tco_nombre: string } | null
  sgrh_cat_tipos_jornada: { tjo_nombre: string } | null
  sgrh_cat_motivos_salida: { mot_nombre: string } | null
}

export type GetEmployeeDetailResult =
  { ok: true; data: EmpleadoDetalle } | { ok: false; error: string; notFound?: boolean }

/** Aplana los catálogos embebidos de una fila de historial. */
function toContrato(row: HistorialQueryRow): ContratoDetalle {
  const {
    sgrh_cat_puestos,
    sgrh_sucursales,
    sgrh_cat_tipos_contrato,
    sgrh_cat_tipos_jornada,
    sgrh_cat_motivos_salida,
    ...base
  } = row

  return {
    ...base,
    puesto_nombre: sgrh_cat_puestos?.pue_nombre ?? '—',
    sucursal_nombre: sgrh_sucursales?.suc_nombre ?? '—',
    tipo_contrato_nombre: sgrh_cat_tipos_contrato?.tco_nombre ?? '—',
    tipo_jornada_nombre: sgrh_cat_tipos_jornada?.tjo_nombre ?? '—',
    motivo_salida_nombre: sgrh_cat_motivos_salida?.mot_nombre ?? null,
  }
}

/** Ficha completa del empleado + todos sus contratos (vigente y cerrados). */
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
    .select(
      `
      *,
      sgrh_cat_tipos_identificacion ( tid_nombre ),
      sgrh_direcciones (
        dir_distrito_id, dir_codigo_postal, dir_senas_exactas,
        sgrh_cat_distritos (
          dis_nombre,
          sgrh_cat_cantones ( can_nombre, sgrh_cat_provincias ( prv_nombre ) )
        )
      )
    `
    )
    .eq('emp_id', empId)
    .maybeSingle<EmpleadoQueryRow>()

  if (errEmpleado) {
    return { ok: false, error: 'No se pudo cargar el empleado.' }
  }

  if (!empleado) {
    return { ok: false, error: 'Empleado no encontrado.', notFound: true }
  }

  // Todos los contratos, no solo el vigente: los cerrados son el historial de
  // contrataciones del tab Contrato. La RLS (historial_select) no filtra por
  // lab_fecha_fin, así que el EMPLEADOS_READ de arriba ya alcanza para verlos.
  const { data: historial, error: errHistorial } = await supabase
    .from('sgrh_historial_laboral')
    .select(
      `
      *,
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre ),
      sgrh_cat_tipos_contrato ( tco_nombre ),
      sgrh_cat_tipos_jornada ( tjo_nombre ),
      sgrh_cat_motivos_salida ( mot_nombre )
    `
    )
    .eq('lab_empleado_id', empId)
    .eq('lab_empresa_id', empresaId)
    .order('lab_fecha_inicio', { ascending: false })
    .returns<HistorialQueryRow[]>()

  if (errHistorial) {
    return { ok: false, error: 'No se pudo cargar el historial de contratos.' }
  }

  // La RLS de esta tabla decide el acceso: si el rol no tiene NOMINA_READ ni
  // EMPLEADOS_WRITE (y no es el propio empleado), simplemente no hay fila.
  const { data: datosPago, error: errPago } = await supabase
    .from('sgrh_empleado_datos_pago')
    .select('edp_banco_id, edp_tipo_cuenta, edp_numero_cuenta, sgrh_cat_bancos ( ban_nombre )')
    .eq('edp_empleado_id', empId)
    .maybeSingle<{
      edp_banco_id: number | null
      edp_tipo_cuenta: string | null
      edp_numero_cuenta: string | null
      sgrh_cat_bancos: { ban_nombre: string } | null
    }>()

  if (errPago) {
    return { ok: false, error: 'No se pudieron cargar los datos de pago.' }
  }

  // Una sola foto: getSignedUrl (no el batch). Si falla o no hay path, la
  // ficha igual se muestra — Avatar cae a iniciales.
  let fotoUrl: string | null = null
  if (empleado.emp_foto_path) {
    const signed = await getStorageProvider().getSignedUrl(
      'FOTOS_EMPLEADO',
      empleado.emp_foto_path,
      TTL_FOTO
    )
    fotoUrl = signed.ok ? signed.data : null
  }

  const { sgrh_cat_tipos_identificacion, sgrh_direcciones, ...empleadoBase } = empleado

  // null para empleados creados antes de que el formulario capturara dirección.
  const direccion: EmpleadoDetalle['direccion'] = sgrh_direcciones
    ? {
        dir_distrito_id: sgrh_direcciones.dir_distrito_id,
        dir_codigo_postal: sgrh_direcciones.dir_codigo_postal,
        dir_senas_exactas: sgrh_direcciones.dir_senas_exactas,
        distrito_nombre: sgrh_direcciones.sgrh_cat_distritos?.dis_nombre ?? '—',
        canton_nombre: sgrh_direcciones.sgrh_cat_distritos?.sgrh_cat_cantones?.can_nombre ?? '—',
        provincia_nombre:
          sgrh_direcciones.sgrh_cat_distritos?.sgrh_cat_cantones?.sgrh_cat_provincias?.prv_nombre ??
          '—',
      }
    : null

  const historialCompleto = (historial ?? []).map(toContrato)
  // El vigente se deriva del mismo resultado en vez de pedirlo aparte. find()
  // y no un .maybeSingle(): si por un bug quedaran dos contratos abiertos, la
  // ficha se sigue mostrando (con el más reciente) en vez de romperse.
  const historialActivo = historialCompleto.find((c) => c.lab_fecha_fin === null) ?? null

  // El número se guarda cifrado (AES-256-GCM), así que se descifra acá, en el
  // servidor. Los tres estados de decryptField NO se aplanan: cuenta_ilegible
  // distingue "no hay cuenta" de "hay una y no se pudo leer". Sin esa distinción
  // el formulario de edición se pintaría vacío y el siguiente guardado
  // sobrescribiría el ciphertext con null, borrando el dato para siempre.
  let datosPagoDto: EmpleadoDetalle['datos_pago'] = null

  if (datosPago) {
    const cuenta = await decryptField(datosPago.edp_numero_cuenta)

    datosPagoDto = {
      edp_banco_id: datosPago.edp_banco_id,
      edp_tipo_cuenta: datosPago.edp_tipo_cuenta,
      edp_numero_cuenta: cuenta.ok ? cuenta.value : null,
      cuenta_ilegible: !cuenta.ok,
      banco_nombre: datosPago.sgrh_cat_bancos?.ban_nombre ?? null,
    }
  }

  const data: EmpleadoDetalle = {
    ...empleadoBase,
    tipo_identificacion_nombre: sgrh_cat_tipos_identificacion?.tid_nombre ?? '—',
    foto_url: fotoUrl,
    historial_activo: historialActivo,
    historial_completo: historialCompleto,
    direccion,
    datos_pago: datosPagoDto,
  }

  return { ok: true, data }
}
