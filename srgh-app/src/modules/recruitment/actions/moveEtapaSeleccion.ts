'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

export type MoveEtapaSeleccionResult = { ok: true } | { ok: false; error: string }

interface EtapaOrdenRow {
  eta_id: number
  eta_orden: number
  eta_fase: number | null
}

/**
 * Sube o baja una etapa un lugar DENTRO de su columna del tablero, que es
 * el orden en que aparece al avanzar una postulación. Sin esto, olvidarse
 * una etapa intermedia obligaba a borrar y recrear todas las siguientes.
 *
 * Intercambia `eta_orden` con la vecina de la misma fase. Son dos UPDATE
 * sin transacción: si el segundo fallara, las dos quedarían con el mismo
 * orden — un empate inofensivo (no hay UNIQUE sobre eta_orden) que el
 * siguiente movimiento resuelve.
 */
export async function moveEtapaSeleccion(
  etapaId: number,
  direccion: 'arriba' | 'abajo'
): Promise<MoveEtapaSeleccionResult> {
  if (!Number.isInteger(etapaId) || etapaId <= 0) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }
  if (direccion !== 'arriba' && direccion !== 'abajo') {
    return { ok: false, error: 'Dirección inválida.' }
  }

  await requirePermission(PERMISOS.CATALOGOS_WRITE)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_orden, eta_fase')
    .eq('eta_activo', true)
    .order('eta_orden', { ascending: true })
    .order('eta_id', { ascending: true })
    .returns<EtapaOrdenRow[]>()

  if (error || !data) {
    return { ok: false, error: 'No se pudo mover la etapa.' }
  }

  const etapa = data.find((row) => row.eta_id === etapaId)
  if (!etapa) {
    return { ok: false, error: 'Etapa no encontrada.' }
  }

  const mismaFase = data.filter((row) => row.eta_fase === etapa.eta_fase)
  const index = mismaFase.findIndex((row) => row.eta_id === etapaId)
  const vecina = mismaFase[direccion === 'arriba' ? index - 1 : index + 1]
  // Ya está en el borde: no es un error, simplemente no hay a dónde ir.
  if (!vecina) return { ok: true }

  // Con órdenes empatados (datos viejos), intercambiar no movería nada:
  // se separan forzando que la que sube quede estrictamente antes.
  const [ordenEtapa, ordenVecina] =
    etapa.eta_orden === vecina.eta_orden
      ? direccion === 'arriba'
        ? [vecina.eta_orden, vecina.eta_orden + 1]
        : [vecina.eta_orden + 1, vecina.eta_orden]
      : [vecina.eta_orden, etapa.eta_orden]

  const primero = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .update({ eta_orden: ordenEtapa })
    .eq('eta_id', etapa.eta_id)
  const segundo = primero.error
    ? primero
    : await supabase
        .from('sgrh_cat_etapas_seleccion')
        .update({ eta_orden: ordenVecina })
        .eq('eta_id', vecina.eta_id)

  if (primero.error || segundo.error) {
    return { ok: false, error: 'No se pudo mover la etapa.' }
  }

  revalidatePath('/settings')
  revalidatePath('/recruitment')
  return { ok: true }
}
