/**
 * Colores del shell cuando la sucursal no personalizó nada. Espejo de los
 * defaults de globals.css (`--color-brand-600` = cyan-600 y `--sidebar-bg`):
 * si cambian allá, cambian acá. Son el punto de partida del picker de
 * Apariencia y a donde vuelve "Restablecer".
 *
 * Archivo propio y no en previewShell.ts: los tests de Apariencia mockean
 * ese módulo entero, y las constantes llegarían undefined.
 */
export const DEFAULT_ACCENT = '#0891b2'
export const DEFAULT_SIDEBAR = '#eef1f4'
