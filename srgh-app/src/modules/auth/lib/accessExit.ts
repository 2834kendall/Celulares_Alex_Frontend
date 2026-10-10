/**
 * Salida que ofrece la pantalla de "acceso no autorizado". A esa pantalla se
 * llega por dos caminos muy distintos, y ofrecerle a todos "cerrar sesión"
 * (como antes) sacaba de la app a quien solo había entrado a algo que no le
 * toca:
 *
 * - `home`: tiene permisos, pero no el de esa sección (requirePermission).
 *   Vuelve al inicio; cerrar sesión queda como segunda opción.
 * - `logout`: tiene sesión pero ningún permiso (el layout del dashboard lo
 *   manda acá). No hay inicio al que volver: solo cerrar sesión.
 * - `login`: no hay sesión (venció, o se abrió el enlace directo).
 */
export type AccessExit = 'home' | 'logout' | 'login'

export function accessExit(claims: { app_metadata?: unknown } | null | undefined): AccessExit {
  if (!claims) return 'login'
  const meta = (claims.app_metadata ?? {}) as { permisos?: unknown }
  return Array.isArray(meta.permisos) && meta.permisos.length > 0 ? 'home' : 'logout'
}
