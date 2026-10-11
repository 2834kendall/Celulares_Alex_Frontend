import { readableTextOn } from '@/lib/utils/color'

const NO_COLOR = '#e2e8f0' // slate-200: una etapa sin color se ve neutra
const NO_COLOR_INK = '#1e293b' // slate-800

/** Clases para pintar algo a color pleno con el tono de la etapa (ver stageTone). */
export const STAGE_SOLID = 'bg-(--stage) text-(--stage-ink)'

/**
 * Variables CSS con el color de una etapa y el color de texto que se lee
 * sobre él. Se ponen en el `style` del elemento y las clases las consumen
 * (`bg-(--stage)`, `text-(--stage-ink)`).
 *
 * El color es libre (lo elige el usuario), así que el texto que va encima no
 * puede ser fijo: --stage-ink se calcula por contraste — blanco sobre un azul
 * marino, oscuro sobre un pastel.
 */
export function stageTone(color: string | null) {
  return {
    '--stage': color ?? NO_COLOR,
    '--stage-ink': color ? readableTextOn(color) : NO_COLOR_INK,
  } as React.CSSProperties
}
