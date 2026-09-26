// ─── Formato de hora de PRESENTACIÓN (12h / 24h) ────────────────────────────
//
// Regla que sostiene todo esto: este archivo solo decide cómo se PINTA una
// hora. Nunca se usa para normalizar datos ni para calcular.
//
// En el proyecto conviven dos cosas que parecen iguales y no lo son:
//
//   * `timeOfDay()` (attendance/lib/time) y `stripSeconds()` (schedules/lib/time)
//     devuelven "HH:MM" en 24h y esa salida ENTRA A LA LÓGICA: ventanas del
//     kiosco (isLunchWindowOpen/isExitWindowOpen), graduación de tardías
//     (diffMinutes → classifyTardiness), reconstrucción de timestamps y
//     valores de <input type="time">. Si devolvieran "8:35 a. m.", todo eso
//     calcularía sobre basura sin tirar error.
//
//   * `formatHora()` (acá) toma ese "HH:MM" ya normalizado y lo convierte en
//     el texto que ve el usuario, según lo que eligió la empresa en
//     Configuración. Se aplica SOLO en el punto donde se renderiza.
//
// Por eso los datos, las server actions y la base siguen siempre en 24h, y
// cambiar el formato no puede alterar ni un cálculo.

export type FormatoHora = '12h' | '24h'

export const FORMATO_HORA_DEFAULT: FormatoHora = '24h'

export function isFormatoHora(value: unknown): value is FormatoHora {
  return value === '12h' || value === '24h'
}

/** Normaliza lo que venga de la base; cualquier cosa inesperada cae al default. */
export function parseFormatoHora(value: unknown): FormatoHora {
  return isFormatoHora(value) ? value : FORMATO_HORA_DEFAULT
}

const HORA_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/

/**
 * "HH:MM" o "HH:MM:SS" (24h) → texto para mostrar.
 *
 *   formatHora('08:35', '24h') → '08:35'
 *   formatHora('08:35', '12h') → '8:35 a. m.'
 *   formatHora('00:05', '12h') → '12:05 a. m.'   (medianoche)
 *   formatHora('12:00', '12h') → '12:00 p. m.'   (mediodía)
 *
 * null/undefined → null, para que el llamador decida qué mostrar ("—").
 * Un texto que no parezca una hora se devuelve tal cual en vez de romper la
 * pantalla: un dato raro es preferible a un error en un listado.
 */
export function formatHora(hora: string | null | undefined, formato: FormatoHora): string | null {
  if (!hora) return null

  const match = HORA_RE.exec(hora.trim())
  if (!match) return hora

  const h = Number(match[1])
  const m = match[2]

  if (formato === '24h') {
    return `${String(h).padStart(2, '0')}:${m}`
  }

  // 12h: 0 → 12 a. m., 1-11 → a. m., 12 → 12 p. m., 13-23 → 1-11 p. m.
  // Con "a. m."/"p. m." (con espacio y puntos), que es como lo escribe la
  // RAE y como lo formatea Intl con locale es-CR — así el reloj del kiosco y
  // el resto del sistema se leen igual.
  const sufijo = h < 12 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${sufijo}`
}

/**
 * Rango "inicio - fin" (turnos, almuerzos). Si falta alguno de los dos
 * extremos devuelve null en vez de "08:00 - —".
 */
export function formatRangoHora(
  inicio: string | null | undefined,
  fin: string | null | undefined,
  formato: FormatoHora
): string | null {
  const a = formatHora(inicio, formato)
  const b = formatHora(fin, formato)
  return a && b ? `${a} - ${b}` : null
}
