import { z } from 'zod'

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Colores del shell: hex #RRGGBB, o null = heredar (marca → empresa → sistema). */
export const aparienciaSchema = z.object({
  colorAcento: z
    .string()
    .regex(HEX_RE, 'El color de acento debe ser un hex válido (ej. #0891B2).')
    .nullable(),
  colorSidebar: z
    .string()
    .regex(HEX_RE, 'El color de la barra debe ser un hex válido (ej. #ECECEF).')
    .nullable(),
})

export type AparienciaInput = z.infer<typeof aparienciaSchema>
export type AparienciaResult = { ok: true } | { ok: false; error: string }

/**
 * El color como lo guarda la base (#rrggbb en minúsculas), o null si no es
 * válido. Acepta que falte el numeral: es como se copia de muchos programas.
 */
export function normalizarHex(valor: string): string | null {
  const limpio = valor.trim().toLowerCase()
  const conNumeral = limpio.startsWith('#') ? limpio : `#${limpio}`
  return HEX_RE.test(conNumeral) ? conNumeral : null
}
