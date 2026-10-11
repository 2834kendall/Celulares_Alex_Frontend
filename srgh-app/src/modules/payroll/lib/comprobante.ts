/**
 * Código de verificación del comprobante de pago.
 *
 * sgrh_comprobantes_pago existía desde el baseline —con su índice único, sus
 * políticas de RLS y su columna de confirmación del empleado— pero ninguna
 * parte del código la escribía: el comprobante se armaba al vuelo desde el
 * detalle del periodo y no quedaba evidencia de pago. Este código es lo que
 * vuelve verificable ese papel: va impreso en el comprobante y se puede
 * cotejar contra la fila guardada.
 *
 * Alfabeto sin caracteres ambiguos (I, L, O, 0, 1) porque el código se dicta
 * por teléfono y se copia a mano de un papel impreso.
 */

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const GRUPOS = 3
const LARGO_GRUPO = 4

/**
 * Código nuevo con formato XXXX-XXXX-XXXX.
 *
 * 31^12 ≈ 7,9 × 10^17 combinaciones; la colisión es despreciable, pero
 * com_codigo_verificacion es UNIQUE en la base y quien llama debe reintentar
 * si Postgres devuelve 23505 (ver marcarDetallePagado).
 */
export function generarCodigoVerificacion(): string {
  const bytes = new Uint8Array(GRUPOS * LARGO_GRUPO)
  crypto.getRandomValues(bytes)

  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length])

  return Array.from({ length: GRUPOS }, (_, g) =>
    letras.slice(g * LARGO_GRUPO, (g + 1) * LARGO_GRUPO).join('')
  ).join('-')
}

/**
 * Deja un código escrito a mano como se guardó: en mayúsculas y con guiones
 * (XXXX-XXXX-XXXX). Acepta minúsculas, espacios y separadores de más o de
 * menos —incluidos los guiones "raros" (‐ – —) y los espacios duros que
 * aparecen al copiar el código de un PDF o de un correo—, porque se copia de
 * un papel impreso. Devuelve null si no tiene 12 caracteres alfanuméricos.
 */
export function normalizarCodigoVerificacion(codigo: string): string | null {
  const limpio = codigo.toUpperCase().replace(/[\s\-‐‑‒–—―−_.·/]/g, '')
  if (!/^[A-Z0-9]{12}$/.test(limpio)) return null
  return [limpio.slice(0, 4), limpio.slice(4, 8), limpio.slice(8)].join('-')
}

/**
 * Caracteres que un código nunca lleva (I, L, O, 0, 1: ver ALFABETO) y que
 * salen de leer mal el papel. Con alguno, el código no puede existir: se le
 * dice a quien busca en vez de un "no existe" que no explica nada.
 */
export function confusionesEnCodigo(codigoNormalizado: string): string[] {
  const vistos = new Set<string>()
  for (const c of codigoNormalizado.replace(/-/g, '')) {
    if (!ALFABETO.includes(c)) vistos.add(c)
  }
  return [...vistos]
}
