import { unstable_rethrow } from 'next/navigation'

/**
 * Para el `catch` de quien llama una Server Action desde el cliente.
 *
 * Una acción rechaza su promesa por dos motivos muy distintos: falló la red, o
 * redirigió (`requirePermission` sin el permiso manda a /unauthorized). En el
 * segundo caso Next ya está navegando, así que no hay nada que avisar: decir
 * "revisá tu conexión" sería falso.
 *
 * Una sesión ya vencida NO llega por acá: el proxy responde con la página de login
 * antes de que corra la acción, Next no la puede leer y rechaza con un error común,
 * sin navegar. Se ve como una falla más, y la siguiente navegación lleva a /login.
 *
 * `unstable_rethrow` es la única forma pública de reconocer esos errores. Se
 * envuelve porque relanzar desde un handler de clic no lo atrapa ningún boundary:
 * quedaría como un rechazo sin manejar, y Next navega igual.
 */
export function isNextNavigation(error: unknown): boolean {
  try {
    unstable_rethrow(error)
    return false
  } catch {
    return true
  }
}
