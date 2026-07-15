'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type { CatalogoItem } from '@/modules/employees/types'

export type GetCatalogoResult = { ok: true; data: CatalogoItem[] } | { ok: false; error: string }

const CATALOG_ERROR = 'No se pudo cargar el catálogo.'

/** Puestos activos de la empresa (RLS filtra por empresa). */
export async function getPuestos(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_puestos')
    .select('pue_id, pue_nombre')
    .eq('pue_activo', true)
    .order('pue_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((p) => ({ id: p.pue_id, nombre: p.pue_nombre })) }
}

/** Sucursales activas de la empresa (RLS filtra por empresa). */
export async function getSucursales(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_sucursales')
    .select('suc_id, suc_nombre')
    .eq('suc_activa', true)
    .order('suc_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((s) => ({ id: s.suc_id, nombre: s.suc_nombre })) }
}

/** Catálogo global de tipos de contrato. */
export async function getTiposContrato(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_contrato')
    .select('tco_id, tco_nombre')
    .order('tco_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((t) => ({ id: t.tco_id, nombre: t.tco_nombre })) }
}

/** Catálogo global de tipos de jornada. */
export async function getTiposJornada(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_jornada')
    .select('tjo_id, tjo_nombre')
    .order('tjo_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((t) => ({ id: t.tjo_id, nombre: t.tjo_nombre })) }
}

/** Catálogo global de tipos de identificación activos. */
export async function getTiposIdentificacion(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_tipos_identificacion')
    .select('tid_id, tid_nombre')
    .eq('tid_activo', true)
    .order('tid_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((t) => ({ id: t.tid_id, nombre: t.tid_nombre })) }
}

/** Catálogo global de bancos activos (sgrh_cat_bancos). */
export async function getBancos(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.EMPLEADOS_READ)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_bancos')
    .select('ban_id, ban_nombre')
    .eq('ban_activo', true)
    .order('ban_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((b) => ({ id: b.ban_id, nombre: b.ban_nombre })) }
}

/** Roles activos del sistema — solo para el paso de usuario del onboarding. */
export async function getRoles(): Promise<GetCatalogoResult> {
  await requirePermission(PERMISOS.USUARIOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_roles')
    .select('rol_id, rol_nombre')
    .eq('rol_activo', true)
    .order('rol_nombre', { ascending: true })

  if (error) {
    return { ok: false, error: CATALOG_ERROR }
  }

  return { ok: true, data: data.map((r) => ({ id: r.rol_id, nombre: r.rol_nombre })) }
}
