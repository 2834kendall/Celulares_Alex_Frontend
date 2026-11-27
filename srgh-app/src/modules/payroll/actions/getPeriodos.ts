'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { ERROR_FILTRO_MARCA, getFiltroMarca } from '@/lib/empresa/contexto-activo'
import { PERMISOS } from '@/lib/permissions/catalog'
import { atrasadoParaLaCuenta, periodoAtrasado } from '@/modules/payroll/lib/estadoPeriodo'
import type { PeriodoListItem } from '@/modules/payroll/types'
import { sucursalLabel } from '@/lib/empresa/marca-label'
import { ETIQUETA_TODA_LA_EMPRESA, esCuentaDeEmpresa } from '@/modules/payroll/lib/alcancePlanilla'

interface PeriodoQueryRow {
  npe_id: number
  npe_periodo_mes: number
  npe_periodo_anio: number
  npe_quincena: number
  npe_fecha_inicio_periodo: string | null
  npe_fecha_fin_periodo: string | null
  npe_estado: string
  npe_fecha_pago: string | null
  /** null = periodo de toda la empresa. */
  npe_sucursal_id?: number | null
  sgrh_sucursales: {
    suc_nombre: string | null
    sgrh_marcas_comerciales?: { mco_nombre: string } | null
  } | null
  /** Conteo agregado por PostgREST: una fila con { count }. */
  sgrh_nomina_detalle: { count: number }[] | null
}

export type GetPeriodosResult = { ok: true; data: PeriodoListItem[] } | { ok: false; error: string }

/**
 * Periodos de planilla de la empresa, del más reciente al más antiguo.
 * RLS (nomina_periodo_select) ya limita a la empresa del JWT y exige
 * NOMINA_READ — el requirePermission de aquí solo corta antes y barato.
 *
 * Con una marca elegida en el selector: de los periodos por sucursal, solo
 * los de esa marca; los de toda la empresa salen siempre, contando nada más
 * las filas de esa marca.
 */
export async function getPeriodos(): Promise<GetPeriodosResult> {
  const claims = await requirePermission(PERMISOS.NOMINA_READ)
  const cuentaDeEmpresa = esCuentaDeEmpresa(claims)

  const filtro = await getFiltroMarca()
  if (filtro.estado === 'error') return { ok: false, error: ERROR_FILTRO_MARCA }

  const supabase = await createClient()

  let consulta = supabase
    .from('sgrh_nomina_periodo')
    .select(
      `
      npe_id,
      npe_periodo_mes,
      npe_periodo_anio,
      npe_quincena,
      npe_fecha_inicio_periodo,
      npe_fecha_fin_periodo,
      npe_estado,
      npe_fecha_pago,
      npe_sucursal_id,
      sgrh_sucursales ( suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) ),
      sgrh_nomina_detalle ( count )
    `
    )
    .order('npe_periodo_anio', { ascending: false })
    .order('npe_periodo_mes', { ascending: false })
    .order('npe_quincena', { ascending: false })
  if (filtro.sucursalIds) {
    const ids = filtro.sucursalIds.join(',')
    consulta = consulta
      .or(`npe_sucursal_id.is.null,npe_sucursal_id.in.(${ids})`)
      // El conteo de filas, solo las de la marca (en un periodo por sucursal
      // ya lo son todas).
      .in('sgrh_nomina_detalle.ndt_sucursal_id', filtro.sucursalIds)
  }

  const { data, error } = await consulta.returns<PeriodoQueryRow[]>()

  if (error) {
    return { ok: false, error: 'No se pudieron cargar los periodos de nómina.' }
  }

  const periodos: PeriodoListItem[] = (data ?? []).map((row) => {
    // Antes se traía el id de cada fila de cada periodo solo para contarlas:
    // la lista crecía con cada quincena pagada. Ahora la base devuelve el número.
    const totalEmpleados = row.sgrh_nomina_detalle?.[0]?.count ?? 0
    return {
      id: row.npe_id,
      mes: row.npe_periodo_mes,
      anio: row.npe_periodo_anio,
      quincena: row.npe_quincena,
      fechaInicio: row.npe_fecha_inicio_periodo,
      fechaFin: row.npe_fecha_fin_periodo,
      estado: row.npe_estado,
      atrasado: atrasadoParaLaCuenta(periodoAtrasado(row.npe_estado, row.npe_fecha_fin_periodo), {
        porEmpresa: row.npe_sucursal_id === null,
        cuentaDeEmpresa,
        // La RLS deja contar solo las filas de las sucursales de la cuenta.
        filasVisibles: totalEmpleados,
      }),
      fechaPago: row.npe_fecha_pago,
      sucursalNombre:
        sucursalLabel(row.sgrh_sucursales) ??
        (row.npe_sucursal_id === null ? ETIQUETA_TODA_LA_EMPRESA : '—'),
      totalEmpleados,
      // Un periodo pagado no se elimina (la acción lo rechazaría con pagos
      // marcados): no se ofrece el botón.
      puedeEliminar:
        row.npe_estado !== 'pagado' && (row.npe_sucursal_id !== null || cuentaDeEmpresa),
    }
  })

  return { ok: true, data: periodos }
}
