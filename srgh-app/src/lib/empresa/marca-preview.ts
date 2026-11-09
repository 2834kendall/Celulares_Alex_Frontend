import { cookies } from 'next/headers'

/**
 * Marca que un admin (EMPRESAS_WRITE) eligió ver desde el selector de la
 * barra superior. SOLO afecta el TEMA (colores, logo y nombre del shell),
 * nunca el alcance de los datos: `get_empresa_id()`/`get_sucursal_ids()`
 * siguen leyendo únicamente del JWT, y esta cookie no entra en ninguna query
 * de datos ni en ninguna policy de RLS.
 *
 * Reemplaza a la vieja cookie de sucursal (`sgrh_sucursal_preview`): el tema
 * ahora es de la marca, y con otro nombre una cookie vieja (que guardaba un
 * id de SUCURSAL) nunca se lee como id de marca.
 */
export const MARCA_PREVIEW_COOKIE = 'sgrh_marca_preview'

/** Id de la marca en preview, o null si no hay ninguna elegida. */
export async function getMarcaPreviewId(): Promise<number | null> {
  const store = await cookies()
  const raw = store.get(MARCA_PREVIEW_COOKIE)?.value
  if (!raw) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}
