const STORAGE_KEY = 'sgrh_kiosco_dispositivo_id'

/**
 * ID estable por dispositivo/navegador para mar_dispositivo_id: se genera una
 * sola vez y se persiste en localStorage, asi todas las marcas de esa
 * tablet quedan asociadas al mismo identificador.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return ''

  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const id = crypto.randomUUID()
  window.localStorage.setItem(STORAGE_KEY, id)
  return id
}
