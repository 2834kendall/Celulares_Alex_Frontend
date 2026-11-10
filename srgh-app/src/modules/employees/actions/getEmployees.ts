'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import type { EmpleadoListItem } from '@/modules/employees/types'
import { sucursalLabel } from '@/lib/empresa/marca-label'
import { leerPaginado } from '@/modules/payroll/lib/paginado'

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
  emp_foto_path: string | null
}

interface HistorialActivoRow {
  lab_empleado_id: number
  lab_sucursal_id: number
  lab_fecha_inicio: string
  lab_salario_base: number
  sgrh_cat_puestos: { pue_nombre: string | null } | null
  sgrh_sucursales: {
    suc_nombre: string | null
    sgrh_marcas_comerciales?: { mco_nombre: string } | null
  } | null
  sgrh_cat_tipos_contrato: { tco_nombre: string | null } | null
}

interface ContratoCerradoRow {
  lab_id: number
  lab_empleado_id: number
  lab_sucursal_id: number
  lab_fecha_inicio: string
}

export type GetEmployeesResult =
  { ok: true; data: EmpleadoListItem[] } | { ok: false; error: string }

function soloDeLaMarca(
  empleados: EmpleadoQueryRow[],
  sucursalIds: number[] | null,
  vigentes: Map<number, HistorialActivoRow>,
  cerrados: ContratoCerradoRow[]
): EmpleadoQueryRow[] {
  if (!sucursalIds) return empleados

  const ultimoCerrado = new Map<number, ContratoCerradoRow>()
  for (const contrato of cerrados) {
    const actual = ultimoCerrado.get(contrato.lab_empleado_id)
    const esPosterior =
      !actual ||
      contrato.lab_fecha_inicio > actual.lab_fecha_inicio ||
      (contrato.lab_fecha_inicio === actual.lab_fecha_inicio && contrato.lab_id > actual.lab_id)
    if (esPosterior) ultimoCerrado.set(contrato.lab_empleado_id, contrato)
  }

  return empleados.filter((empleado) => {
    const sucursal =
      vigentes.get(empleado.emp_id)?.lab_sucursal_id ??
      ultimoCerrado.get(empleado.emp_id)?.lab_sucursal_id
    return sucursal !== undefined && sucursalIds.includes(sucursal)
  })
}

/**
 * Lista de empleados con su contrato vigente (si existe). RLS ya limita las
 * filas visibles a la empresa del usuario; el filtro de empresa en el historial
 * evita mezclar contratos de otras empresas para empleados compartidos.
 *
 * Con una marca elegida, cada persona cuenta por su contrato vigente y un
 * exempleado por el último que tuvo. Sin ningún contrato solo sale en "Todas".
 */
export async function getEmployees(): Promise<GetEmployeesResult> {
  const claims = await requirePermission(PERMISOS.EMPLEADOS_READ)
  const empresaId = (claims.app_metadata as { empresa_id?: number })?.empresa_id

  if (!empresaId) {
    return { ok: false, error: 'No se pudo determinar la empresa del usuario.' }
  }

  const filtro = await getFiltroMarca()
  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }

  const supabase = await createClient()

  // Independientes: el historial filtra por empresa, no por los empleados
  // leídos. En paralelo ahorran un viaje (~200 ms desde CR).
  const [
    { data: empleados, error: errEmpleados },
    { data: historiales, error: errHistorial },
    { data: cerrados, error: errCerrados },
  ] = await Promise.all([
    supabase
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
      emp_nacionalidad,
      emp_foto_path
    `
      )
      .order('emp_apellido_1', { ascending: true })
      .returns<EmpleadoQueryRow[]>(),
    supabase
      .from('sgrh_historial_laboral')
      .select(
        `
      lab_empleado_id,
      lab_sucursal_id,
      lab_fecha_inicio,
      lab_salario_base,
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) ),
      sgrh_cat_tipos_contrato ( tco_nombre )
    `
      )
      .eq('lab_empresa_id', empresaId)
      .is('lab_fecha_fin', null)
      .returns<HistorialActivoRow[]>(),
    // Solo con marca elegida: de qué tienda fue cada exempleado.
    filtro.sucursalIds
      ? leerPaginado<ContratoCerradoRow>((desde, hasta) =>
          supabase
            .from('sgrh_historial_laboral')
            .select('lab_id, lab_empleado_id, lab_sucursal_id, lab_fecha_inicio')
            .eq('lab_empresa_id', empresaId)
            .not('lab_fecha_fin', 'is', null)
            .order('lab_id')
            .range(desde, hasta)
            .returns<ContratoCerradoRow[]>()
        )
      : Promise.resolve({ data: [] as ContratoCerradoRow[], error: null }),
  ])

  if (errEmpleados) {
    return { ok: false, error: 'No se pudieron cargar los empleados.' }
  }

  if (errHistorial || errCerrados) {
    return { ok: false, error: 'No se pudieron cargar los contratos vigentes.' }
  }

  const historialPorEmpleado = new Map<number, HistorialActivoRow>()
  for (const historial of historiales ?? []) {
    historialPorEmpleado.set(historial.lab_empleado_id, historial)
  }

  const visibles = soloDeLaMarca(
    empleados ?? [],
    filtro.sucursalIds,
    historialPorEmpleado,
    cerrados
  )

  // Firmado EN LOTE: una sola llamada al proveedor para toda la lista, no una
  // por fila (ver TTL_FOTO — se re-firma en cada carga de la página). Si el
  // firmado falla, la lista igual se muestra sin fotos: el storage nunca
  // tumba el listado de empleados.
  const paths = visibles
    .map((empleado) => empleado.emp_foto_path)
    .filter((path): path is string => Boolean(path))

  let fotoUrls: Record<string, string> = {}
  if (paths.length > 0) {
    const signed = await getStorageProvider().getSignedUrls('FOTOS_EMPLEADO', paths, TTL_FOTO)
    if (signed.ok) {
      fotoUrls = signed.data
    }
  }

  const data: EmpleadoListItem[] = visibles.map((empleado) => {
    const historial = historialPorEmpleado.get(empleado.emp_id)
    // emp_foto_path nunca sale hacia el cliente: solo la URL firmada opaca.
    const { emp_foto_path, ...empleadoSinFoto } = empleado

    return {
      ...empleadoSinFoto,
      puesto_nombre: historial?.sgrh_cat_puestos?.pue_nombre ?? null,
      sucursal_nombre: sucursalLabel(historial?.sgrh_sucursales) ?? null,
      tipo_contrato_nombre: historial?.sgrh_cat_tipos_contrato?.tco_nombre ?? null,
      salario_base: historial?.lab_salario_base ?? null,
      fecha_inicio_contrato: historial?.lab_fecha_inicio ?? null,
      activo: Boolean(historial),
      foto_url: emp_foto_path ? (fotoUrls[emp_foto_path] ?? null) : null,
    }
  })

  return { ok: true, data }
}
