// Utilidades de IBAN costarricense.
//
// Estructura del IBAN CR (22 caracteres):
//   CR + 2 dígitos verificadores + 0 (reservado) + 3 de entidad financiera + 14 de cuenta
// El código de entidad (posiciones 6-8) permite validar que la cuenta
// pertenezca al banco seleccionado (sgrh_cat_bancos.ban_codigo).

export const IBAN_CR_REGEX = /^CR\d{20}$/

export const IBAN_CR_LENGTH = 22

/** Deja solo caracteres alfanuméricos, en mayúsculas ('cr05 0152…' → 'CR050152…'). */
export function normalizeIban(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
}

/** Agrupa de 4 en 4 para lectura: 'CR05015202001026284066' → 'CR05 0152 0200 1026 2840 66'. */
export function formatIbanGroups(value: string): string {
  return normalizeIban(value)
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

/** Código de entidad financiera embebido en un IBAN CR ya normalizado. */
export function ibanBankCode(iban: string): string {
  return iban.slice(5, 8)
}

/**
 * Checksum estándar ISO 13616 (mod 97-10): mueve los primeros 4 caracteres al
 * final, convierte letras a números (A=10 … Z=35) y el resto debe ser 1.
 * Se calcula dígito a dígito para no desbordar Number.
 */
export function isValidIbanChecksum(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return remainder === 1
}
