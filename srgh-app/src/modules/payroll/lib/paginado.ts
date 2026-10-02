/**
 * Lectura por páginas para PostgREST.
 *
 * Sin dependencias de servidor a propósito: lo usan tanto módulos
 * 'server-only' como server actions.
 */

/**
 * Supabase corta cada respuesta en max_rows (1000, supabase/config.toml) SIN
 * avisar: la consulta "funciona" y devuelve las primeras mil filas. Con la
 * planilla de todos los empleados eso se pasa en un par de años, y lo que
 * quedaba afuera eran quincenas pagadas que nunca llegaban al aguinaldo. Se
 * lee por páginas, ordenado por la llave, hasta que una página venga corta.
 */
const PAGINA = 1000

export async function leerPaginado<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error) return { data: [], error }
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return { data: filas, error: null }
  }
}
