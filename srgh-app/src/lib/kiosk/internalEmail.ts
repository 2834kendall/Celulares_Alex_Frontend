/**
 * Internal address of a kiosk account (SGRH-111).
 *
 * Supabase Auth identifies every account by email, but a kiosk has no mailbox.
 * New kiosks get `kiosk-<uuid>@<domain>`: nobody reads it, nothing is ever sent
 * to it (the account is created already confirmed and password recovery skips
 * it), and the login form reaches it through the kiosk username.
 *
 * `.internal` is reserved for private use (ICANN, 2024), so the address can
 * never be delivered to a real third party. The domain is configurable in case
 * a Supabase project rejects it. Server code only: the variable is not public.
 */
const DEFAULT_KIOSK_EMAIL_DOMAIN = 'kiosk.sgrh.internal'

export function kioskEmailDomain() {
  return (process.env.KIOSK_EMAIL_DOMAIN?.trim() || DEFAULT_KIOSK_EMAIL_DOMAIN).toLowerCase()
}

export function internalKioskEmail(id: string = crypto.randomUUID()) {
  return `kiosk-${id}@${kioskEmailDomain()}`
}

export function isInternalKioskEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${kioskEmailDomain()}`)
}
