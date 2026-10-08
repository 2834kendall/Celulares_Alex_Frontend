'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { normalizarCodigoVerificacion } from '@/modules/payroll/lib/comprobante'

export type BuscarComprobanteResult = { ok: true; href: string } | { ok: false; error: string }

interface ComprobanteRow {
  com_nomina_detalle_id: number
  sgrh_nomina_detalle: { ndt_nomina_periodo_id: number } | null
}

/**
 * Busca un comprobante por el código de verificación impreso en él y
 * devuelve la ruta para abrirlo. Sirve para comprobar que un papel que alguien
 * presenta corresponde a un pago registrado, y para encontrar el periodo de
 * ese pago.
 *
 * El código puede ser de una planilla (sgrh_comprobantes_pago) o de un pago
 * de aguinaldo o liquidación (sgrh_pagos_extraordinarios). Los dos son UNIQUE
 * en la base, así que a lo sumo hay uno de cada lado. RLS limita la búsqueda a
 * la empresa del usuario: el código de otra empresa no aparece.
 *
 * Al desmarcar un pago de planilla su comprobante se borra: ese código deja
 * de encontrarse, que es lo correcto, porque ese papel ya no vale.
 */
export async function buscarComprobante(codigo: string): Promise<BuscarComprobanteResult> {
  if (typeof codigo !== 'string' || !codigo.trim()) {
    return { ok: false, error: 'Escribí el código de verificación del comprobante.' }
  }
  const normalizado = normalizarCodigoVerificacion(codigo)
  if (!normalizado) {
    return {
      ok: false,
      error: 'El código tiene 12 letras o números, con el formato XXXX-XXXX-XXXX.',
    }
  }

  await requirePermission(PERMISOS.NOMINA_READ)
  const supabase = await createClient()

  const { data: planilla, error: errPlanilla } = await supabase
    .from('sgrh_comprobantes_pago')
    .select('com_nomina_detalle_id, sgrh_nomina_detalle ( ndt_nomina_periodo_id )')
    .eq('com_codigo_verificacion', normalizado)
    .maybeSingle<ComprobanteRow>()

  if (errPlanilla) {
    return { ok: false, error: 'No se pudo buscar el comprobante.' }
  }
  if (planilla?.sgrh_nomina_detalle) {
    return {
      ok: true,
      href: `/comprobante/${planilla.sgrh_nomina_detalle.ndt_nomina_periodo_id}/${planilla.com_nomina_detalle_id}`,
    }
  }

  const { data: extraordinario, error: errExtraordinario } = await supabase
    .from('sgrh_pagos_extraordinarios')
    .select('pex_id')
    .eq('pex_codigo_verificacion', normalizado)
    .maybeSingle<{ pex_id: number }>()

  if (errExtraordinario) {
    return { ok: false, error: 'No se pudo buscar el comprobante.' }
  }
  if (extraordinario) {
    return { ok: true, href: `/comprobante/extraordinario/${extraordinario.pex_id}` }
  }

  return {
    ok: false,
    error: `No hay ningún comprobante con el código ${normalizado}. Si el pago se desmarcó, su comprobante dejó de valer.`,
  }
}
