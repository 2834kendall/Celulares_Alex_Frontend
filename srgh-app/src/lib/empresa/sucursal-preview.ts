import { cookies } from 'next/headers'

/**
 * Sucursal que un admin (EMPRESAS_WRITE) eligio ver desde el selector de la
 * barra superior — SOLO afecta el TEMA (colores + nombre en el shell), nunca
 * el alcance de los datos. `get_empresa_id()`/`get_sucursal_id()` siguen
 * leyendo unicamente del JWT: esta cookie jamas debe entrar en una query ni
 * en una policy de RLS. Es la manera de que un ADMIN sin sucursal fija pueda
 * comprobar como se ve la apariencia guardada en Configuracion navegando la
 * app real, en vez de solo la previsualizacion efimera dentro del formulario
 * (que se pierde apenas se navega o se refresca).
 */
export const SUCURSAL_PREVIEW_COOKIE = 'sgrh_sucursal_preview'

/** Id de la sucursal en preview, o null si no hay ninguna elegida. */
export async function getSucursalPreviewId(): Promise<number | null> {
  const store = await cookies()
  const raw = store.get(SUCURSAL_PREVIEW_COOKIE)?.value
  if (!raw) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}
