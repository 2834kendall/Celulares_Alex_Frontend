/**
 * Fecha corta escribible: el puente entre lo que la persona teclea
 * ("15/08/2026") y lo que viaja por el sistema ("2026-08-15").
 *
 * Mismo criterio que `formatoHora.ts`: aca solo se decide como se ESCRIBE y
 * como se PINTA una fecha. El dato, los esquemas de Zod, las server actions y
 * la base siguen siempre en ISO "YYYY-MM-DD", y cambiar la mascara no puede
 * alterar ningun calculo.
 *
 * Es un modulo puro a proposito, con su propio test: el par parse/format no
 * vive en linea en el componente, igual que `normalizeIban`/`formatIbanGroups`
 * viven en `modules/employees/lib/iban.ts` y no dentro del campo de IBAN.
 */

/** La fecha completa enmascarada, que es lo unico que `parseShortDate` acepta. */
const FULL_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

/** Solo los digitos, recortados a los 8 de "ddmmaaaa". */
export function onlyDigits(text: string): string {
  return text.replace(/\D/g, '').slice(0, 8)
}

/**
 * Mascara posicional: descarta lo que no sea digito e inserta las barras.
 *
 * La barra se agrega al COMPLETAR un grupo ("15" -> "15/"), no antes de
 * empezar el siguiente: asi la persona ve que el dia ya quedo cerrado sin
 * tener que teclear el separador.
 *
 *   ""         -> ""
 *   "1"        -> "1"
 *   "15"       -> "15/"
 *   "158"      -> "15/8"
 *   "1508"     -> "15/08/"
 *   "15082026" -> "15/08/2026"
 */
export function applyMask(text: string): string {
  const d = onlyDigits(text)
  if (d.length === 0) return ''
  if (d.length < 2) return d
  if (d.length === 2) return `${d}/`
  if (d.length < 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  if (d.length === 4) return `${d.slice(0, 2)}/${d.slice(2)}/`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Resuelve un cambio de texto del input a la cadena enmascarada final.
 *
 * Existe por el borrado sobre una barra: la mascara deja un separador final
 * ("15/"), y al apretar Borrar el input entrega "15", que al re-enmascarar
 * vuelve a ser "15/". El campo queda trabado. Si la cantidad de digitos no
 * cambio pero el texto se acorto, lo que se borro fue el separador, asi que
 * hay que quitar el digito de atras.
 */
export function applyEdit(previousText: string, nextText: string): string {
  const nextDigits = onlyDigits(nextText)
  const gotShorter = nextText.length < previousText.length
  const sameDigits = nextDigits === onlyDigits(previousText)

  if (gotShorter && sameDigits) return applyMask(nextDigits.slice(0, -1))
  return applyMask(nextDigits)
}

/**
 * Normaliza un PEGADO antes de pasarlo por la mascara.
 *
 * La mascara es posicional, asi que pegar "15/8/2026" la rompe: tomaria los
 * digitos "1582026" y armaria "15/82/026". Aca se reacomoda por segmentos y
 * se rellena con cero.
 *
 * Un año de dos cifras se descarta en vez de adivinarse: "5-8-26" podria ser
 * 1926 o 2026, y en un campo de fecha de nacimiento equivocarse por un siglo
 * no es un detalle.
 */
export function digitsFromPaste(text: string): string {
  const parts = text
    .trim()
    .split(/[^0-9]+/)
    .filter(Boolean)

  if (parts.length === 1) return onlyDigits(parts[0])

  if (parts.length === 3) {
    const [day, month, year] = parts
    if (day.length <= 2 && month.length <= 2 && year.length === 4) {
      return `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`
    }
  }

  return ''
}

export type ShortDate =
  | { state: 'empty' }
  | { state: 'incomplete' }
  | { state: 'impossible' }
  | { state: 'ok'; iso: string }

/**
 * "15/08/2026" -> { state: 'ok', iso: '2026-08-15' }.
 *
 * Valida el calendario DE VERDAD, con el ida y vuelta por `Date`: el 31 de
 * febrero no existe, y un regex no lo sabe. Ojo que esto no se puede delegar
 * a `isValidISODate` (`modules/attendance/lib/time.ts`), que solo mira el
 * formato: `new Date('2026-02-30T00:00:00')` no es invalida, rueda al 2 de
 * marzo, asi que esa funcion devuelve true para una fecha que no existe.
 *
 * El ida y vuelta tambien rechaza los años de 0 a 99 escritos con cuatro
 * cifras ("0085"), porque `new Date(85, ...)` los mapea a 1985 y el año deja
 * de coincidir. Es el comportamiento que se quiere.
 */
export function parseShortDate(text: string): ShortDate {
  const trimmed = text.trim()
  if (trimmed === '') return { state: 'empty' }

  const parts = FULL_DATE.exec(trimmed)
  if (!parts) return { state: 'incomplete' }

  const [, day, month, year] = parts
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  const exists =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)

  return exists ? { state: 'ok', iso: `${year}-${month}-${day}` } : { state: 'impossible' }
}

/**
 * "2026-08-15" -> "15/08/2026". Cadena vacia si no es una fecha ISO.
 *
 * Se arma cortando la cadena y NO con `Intl.DateTimeFormat`: el formateador
 * depende de los datos de locale del entorno, y en un Node compilado con ICU
 * reducido "es-CR" cae a "en-US" y devolveria "08/15/2026" — el dia y el mes
 * dados vuelta, en silencio.
 */
export function formatShortDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}
