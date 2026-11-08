/**
 * Opciones de la cookie de sesion, compartidas por los TRES clientes de
 * Supabase: servidor, navegador y proxy. Tienen que decir lo mismo en los
 * tres; si no, cada uno reescribe la cookie con atributos distintos y el
 * ultimo en correr gana.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 * Sin esto la cookie `sb-*` se crea con el default de @supabase/ssr, del
 * orden de 400 dias. ESA es la razon por la que una sesion se siente eterna,
 * y no `jwt_expiry`: el access token dura una hora, pero el refresh token
 * vive en la cookie y se renueva solo mientras la cookie exista.
 *
 * ── Lo que NO se puede poner, y por que ────────────────────────────────────
 * `httpOnly`. createBrowserClient TIENE que leer esta cookie desde
 * JavaScript, asi que marcarla httpOnly rompe el cliente del navegador. No es
 * un olvido: cerrar esa puerta es un cambio de arquitectura —mover el unico
 * consumidor del cliente de navegador (el hook usePermisos, que solo oculta
 * UI) a props del servidor y borrar createBrowserClient— y no una opcion de
 * cookie. Queda fuera de SGRH-99 a proposito.
 */

/**
 * Siete dias. Pasado ese plazo sin usar la app hay que volver a entrar,
 * aunque el refresh token siguiera siendo valido del lado de Supabase.
 *
 * Es un tope de la cookie, no un timeout de inactividad: Supabase ofrece
 * `inactivity_timeout` y `timebox` del lado del servidor, pero son de plan
 * Pro. Mientras tanto esto es lo que se puede hacer, y el navegador lo aplica
 * sin depender de que corra JavaScript.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export const sessionCookieOptions = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
} as const
