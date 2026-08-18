'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { ACCESO_CONFIGURACION } from '@/lib/permissions/zones'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getSucursalTema } from '@/lib/empresa/get-sucursal-tema'
import type { SgrhJwtClaims } from '@/types/auth'

const HEX_RE = /^#[0-9a-f]{6}$/i

export interface AparienciaInput {
  /**
   * Solo lo usan quienes administran la empresa (permiso `EMPRESAS_WRITE`),
   * para elegir a cuál sucursal de su empresa le están editando el color
   * (ver `SucursalAppearancePanel`) — tengan o no ademas una sucursal fija
   * propia. Se ignora por completo si el usuario NO tiene ese permiso: en
   * ese caso siempre gana la sucursal fija propia, nunca la del cliente.
   */
  sucursalId?: number
  colorAcento: string | null
  colorSidebar: string | null
}

export type UpdateAparienciaResult = { ok: true } | { ok: false; error: string }

/**
 * Guarda el color de acento y/o de sidebar de una sucursal.
 *
 * El `suc_id` objetivo NUNCA se confía ciegamente al cliente: solo quien
 * tiene el permiso `EMPRESAS_WRITE` (administra la empresa, no solo una
 * sucursal) puede elegir cualquier sucursal de la suya via `input.sucursalId`
 * — tenga o no ademas una sucursal fija asignada. Sin ese permiso, siempre
 * se usa la sucursal fija propia (ignorando `input.sucursalId`), asi que un
 * usuario de sucursal jamas puede tocar el color de una ajena. Y aun con el
 * permiso, la fila UPDATE de `sgrh_sucursales` esta protegida por RLS a
 * `suc_empresa_id = get_empresa_id() AND tiene_permiso('EMPRESAS_WRITE')`,
 * asi que ni con un id manipulado se puede alcanzar una sucursal de otra
 * empresa.
 */
export async function updateSucursalApariencia(
  input: AparienciaInput
): Promise<UpdateAparienciaResult> {
  if (input.colorAcento !== null && !HEX_RE.test(input.colorAcento)) {
    return { ok: false, error: 'El color de acento debe ser un hex válido (ej. #0891B2).' }
  }
  if (input.colorSidebar !== null && !HEX_RE.test(input.colorSidebar)) {
    return { ok: false, error: 'El color de la barra debe ser un hex válido (ej. #ECECEF).' }
  }

  const claims = await requireAnyPermission(ACCESO_CONFIGURACION)
  const meta = (claims.app_metadata ?? {}) as Partial<SgrhJwtClaims>
  const administraEmpresa = (meta.permisos ?? []).includes(PERMISOS.EMPRESAS_WRITE)
  const tema = await getSucursalTema(meta.usr_id ?? null)

  const sucursalId = administraEmpresa ? (input.sucursalId ?? tema.sucursalId) : tema.sucursalId

  if (!sucursalId) {
    return { ok: false, error: 'Elegí una sucursal para editar su apariencia.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('sgrh_sucursales')
    .update({
      suc_color_acento: input.colorAcento,
      suc_color_sidebar: input.colorSidebar,
    })
    .eq('suc_id', sucursalId)

  if (error) {
    return { ok: false, error: 'No se pudo guardar la apariencia.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
