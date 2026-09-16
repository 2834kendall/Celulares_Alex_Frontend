import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Alcance de sucursales del usuario, resuelto en vivo contra
 * sgrh_usuarios_empresa_rol (no siempre disponible en el JWT — ver los
 * comentarios historicos en getDailyAttendance.ts/getActiveEmployees.ts).
 *
 * `null` = SIN restricción: el usuario no tiene ninguna fila activa, o
 * alguna de sus filas activas opera a nivel empresa (uer_sucursal_id NULL).
 * Igual que en sucursal_visible(), "sin restricción" en CUALQUIER fila
 * prevalece sobre cualquier otra sucursal puntual que además tenga.
 *
 * Un arreglo no vacío = restringido exactamente a esas sucursales.
 *
 * Cada llamador decide qué significa `null` en su contexto: para un
 * gerente/RRHH viendo asistencia es "ve toda la empresa"; para un kiosco
 * (un dispositivo físico de UNA sola sucursal) es una configuración
 * inválida y debe tratarse como error, nunca como "toda la empresa".
 */
export async function getUsuarioSucursalScope(
  supabase: SupabaseServerClient,
  usrId: number
): Promise<number[] | null> {
  const { data } = await supabase
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_sucursal_id')
    .eq('uer_usuario_id', usrId)
    .eq('uer_activo', true)
    .returns<{ uer_sucursal_id: number | null }[]>()

  const filas = data ?? []
  if (filas.length === 0) return null
  if (filas.some((fila) => fila.uer_sucursal_id === null)) return null

  return filas.map((fila) => fila.uer_sucursal_id as number)
}
