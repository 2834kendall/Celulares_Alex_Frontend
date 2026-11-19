/**
 * Qué sucursales ve la cuenta, leído del JWT (app_metadata.sucursal_ids).
 * Sin `server-only`: lo usan acciones y sus pruebas.
 */

/**
 * Sucursales que ve el usuario (claim sucursal_ids del JWT). null = toda la
 * empresa (ADMIN o usuario sin sucursal asignada), igual que
 * sucursal_visible() en la base.
 */
export function sucursalesVisibles(claims: { app_metadata?: unknown }): number[] | null {
  const ids = ((claims.app_metadata ?? {}) as { sucursal_ids?: unknown }).sucursal_ids
  if (!Array.isArray(ids)) return null
  return ids.filter((id): id is number => typeof id === 'number')
}

/**
 * ¿La cuenta ve esta sucursal? Sin sucursal asignada ve todas. Una sucursal
 * desconocida (null) solo la ve una cuenta de toda la empresa.
 *
 * Para lo que la RLS deja ver a toda la empresa pero es de una sucursal:
 * liquidaciones, sus pagos y el banco de horas se leen por empresa en la base,
 * y la sucursal (la del contrato) se aplica acá.
 */
export function sucursalVisibleParaLaCuenta(
  claims: { app_metadata?: unknown },
  sucursalId: number | null | undefined
): boolean {
  const visibles = sucursalesVisibles(claims)
  if (visibles === null) return true
  return typeof sucursalId === 'number' && visibles.includes(sucursalId)
}

/** Mensaje para un registro de una sucursal que la cuenta no tiene asignada. */
export const ERROR_OTRA_SUCURSAL =
  'Es de una sucursal que no tenés asignada: lo tiene que hacer alguien de esa sucursal o una cuenta de toda la empresa.'
