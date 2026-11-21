/**
 * Kiosk username (SGRH-111): what a kiosk types on the login screen instead of
 * an email address. Same rule as the CHECK on `sgrh_kioscos.kio_login`; if one
 * changes, the other must change too.
 *
 * 3 to 40 characters, lowercase letters, digits, dot, dash or underscore, and
 * it never contains `@`, which is how the login form tells it from an email.
 */
export const KIOSK_LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/

export const KIOSK_LOGIN_HINT =
  'De 3 a 40 caracteres: letras, números, punto, guion o guion bajo, sin espacios.'

export function normalizeKioskLogin(value: string) {
  return value.trim().toLowerCase()
}
