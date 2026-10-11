/**
 * "← Volver" del modo configuración: la última pantalla en la que estaba el
 * usuario antes de entrar a /settings. Se guarda en sessionStorage (por
 * pestaña, se borra al cerrarla); si no hay nada guardado —entró por un
 * enlace directo— se vuelve al inicio.
 *
 * sessionStorage puede no existir o tirar (modo privado, cookies
 * bloqueadas): todo va en try/catch y en el peor caso se vuelve al inicio.
 */

const STORAGE_KEY = 'sgrh:settings-return-path'
export const DEFAULT_RETURN_PATH = '/dashboard'

export function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/')
}

/** Guarda `path` como destino de "Volver", salvo que sea de Configuración. */
export function rememberReturnPath(path: string): void {
  if (isSettingsPath(path.split('?')[0])) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path)
  } catch {
    // Sin storage, "Volver" lleva al inicio.
  }
}

export function readReturnPath(): string {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    // Solo rutas internas: nunca seguir algo que no empiece con "/" ni un
    // "//host" (open redirect si alguien escribiera en el storage).
    if (saved && saved.startsWith('/') && !saved.startsWith('//')) return saved
  } catch {
    // Sin storage, "Volver" lleva al inicio.
  }
  return DEFAULT_RETURN_PATH
}
