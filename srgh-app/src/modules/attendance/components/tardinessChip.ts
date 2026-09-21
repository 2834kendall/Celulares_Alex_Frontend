import type { CSSProperties } from 'react'
import { darken, lighten } from '@/lib/utils/color'
import { DEFAULT_TARDINESS_COLOR } from '@/modules/attendance/lib/infractions'

/**
 * Estilo del chip de un tipo de tardia a partir de su color del catalogo.
 *
 * El color lo elige cada empresa, asi que no puede ser una clase de Tailwind
 * fija: se deriva en linea. Fondo muy aclarado y texto muy oscurecido del
 * MISMO tono — se lee el color del tipo de un vistazo, pero el texto nunca
 * queda claro sobre claro, elija el administrador el color que elija.
 */
export function tardinessChipStyle(color: string | null): CSSProperties {
  const base = color ?? DEFAULT_TARDINESS_COLOR

  return {
    backgroundColor: lighten(base, 0.85),
    color: darken(base, 0.45),
    boxShadow: `inset 0 0 0 1px ${lighten(base, 0.55)}`,
  }
}
