import type { createClient } from '@/lib/supabase/server'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { sortStageRows } from '@/modules/recruitment/lib/stages'
import type { EtapaSeleccionItem } from '@/modules/recruitment/types'

/*
 * Ayudantes de servidor compartidos por las acciones del tablero. Viven en
 * lib/ y no en un archivo 'use server' a propósito: ahí toda función
 * exportada se vuelve un endpoint invocable desde el navegador, y estas
 * reciben un cliente de Supabase ya autenticado.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface EtapaQueryRow {
  eta_id: number
  eta_nombre: string
  eta_orden: number
  eta_fase: number | null
  eta_color: string | null
}

/** Etapas activas ya ordenadas como columnas del tablero, o null si falla. */
export async function fetchStageColumns(
  supabase: SupabaseServerClient
): Promise<EtapaSeleccionItem[] | null> {
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_nombre, eta_orden, eta_fase, eta_color')
    .eq('eta_activo', true)
    .returns<EtapaQueryRow[]>()

  if (error) return null

  // El orden lo decide lib/stages.ts (no un ORDER BY): mientras nadie
  // reordene las columnas se respeta el orden histórico por fase.
  return sortStageRows(data ?? []).map((row, index) => ({
    id: row.eta_id,
    nombre: row.eta_nombre,
    orden: index,
    color: row.eta_color,
  }))
}

/** Etapas desactivadas (no son columnas), por nombre. null si falla. */
export async function fetchInactiveStages(
  supabase: SupabaseServerClient
): Promise<{ id: number; nombre: string; color: string | null }[] | null> {
  const { data, error } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_id, eta_nombre, eta_color')
    .eq('eta_activo', false)
    .order('eta_nombre', { ascending: true })
    .returns<Pick<EtapaQueryRow, 'eta_id' | 'eta_nombre' | 'eta_color'>[]>()

  if (error) return null
  return (data ?? []).map((row) => ({
    id: row.eta_id,
    nombre: row.eta_nombre,
    color: row.eta_color,
  }))
}

/** Último eta_orden usado en el catálogo: lo nuevo (o restaurado) va después. */
export async function lastStageOrder(supabase: SupabaseServerClient): Promise<number> {
  const { data } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_orden')
    .order('eta_orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.eta_orden ?? 0
}

/**
 * Mensaje para un nombre repetido (23505). El nombre es único en TODO el
 * catálogo, también contra las etapas desactivadas — que no se ven en el
 * tablero. Sin distinguirlo, "ya existe" no se entiende: no hay ninguna
 * columna con ese nombre a la vista.
 */
export async function duplicateStageNameError(
  supabase: SupabaseServerClient,
  name: string
): Promise<string> {
  const { data } = await supabase
    .from('sgrh_cat_etapas_seleccion')
    .select('eta_activo')
    .eq('eta_nombre', name)
    .maybeSingle()

  return data && !data.eta_activo
    ? 'Ya existe una etapa desactivada con ese nombre. Restáurela desde Configuración → Etapas de selección.'
    : 'Ya existe una columna con ese nombre.'
}

interface StageEntry {
  applicationId: number
  stageId: number
  note?: string | null
  userId?: number | null
}

/**
 * Registra que una postulación entró a una columna: fila en el historial +
 * etapa actual de la postulación, en una sola transacción (RPC
 * registrar_etapa_postulacion, SECURITY INVOKER: la RLS sigue aplicando).
 *
 * `p_resultado` va en NULL. La columna lo permite (CHECK … IS NULL OR …) y
 * desde SGRH-96 ya no se pregunta. El tipo generado lo declara `string`
 * porque el parámetro no tiene DEFAULT en la función; de ahí el cast — la
 * alternativa era una migración solo para volverlo opcional.
 */
export async function registerStageEntry(
  supabase: SupabaseServerClient,
  { applicationId, stageId, note, userId }: StageEntry
) {
  return supabase.rpc('registrar_etapa_postulacion', {
    p_postulacion_id: applicationId,
    p_etapa_id: stageId,
    p_resultado: null as unknown as string,
    p_fecha: todayInCostaRica(),
    ...(note ? { p_notas: note } : {}),
    ...(userId ? { p_responsable_id: userId } : {}),
  })
}

/**
 * Una postulación recién creada entra directo a la primera columna del
 * tablero. Best-effort: si no hay columnas todavía, o el registro falla, la
 * postulación queda sin etapa y el tablero la muestra aparte como "Sin
 * etapa" — nunca se pierde ni se revierte el alta por esto.
 */
export async function placeInFirstStage(
  supabase: SupabaseServerClient,
  applicationId: number,
  userId?: number | null
): Promise<void> {
  const stages = await fetchStageColumns(supabase)
  const first = stages?.[0]
  if (!first) return
  await registerStageEntry(supabase, { applicationId, stageId: first.id, userId })
}
