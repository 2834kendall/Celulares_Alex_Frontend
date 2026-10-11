import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'

/**
 * Firma EN LOTE las fotos de una lista de empleados: una sola llamada al
 * proveedor para toda la pantalla, nunca una por fila.
 *
 * Este patron vivia duplicado en `getEmployees` mientras que Evaluaciones,
 * Horarios y Asistencia directamente no traian foto — por eso esos modulos
 * mostraban siempre iniciales aunque el colaborador tuviera foto cargada.
 * Al extraerlo, sumar fotos a una pantalla nueva es traer `emp_foto_path` en
 * el select y llamar a esta funcion.
 *
 * NUNCA devuelve el path crudo: solo el mapa path -> URL firmada, que es lo
 * unico que puede cruzar al cliente (ver la nota de `emp_foto_path` en
 * `getEmployees`).
 *
 * El storage es best-effort a proposito: si el firmado falla, se devuelve un
 * mapa vacio y la pantalla se dibuja con iniciales. Un incidente de storage no
 * puede tumbar el listado de empleados, la matriz de turnos ni la asistencia
 * del dia.
 */
export async function signEmployeePhotos(
  paths: readonly (string | null | undefined)[]
): Promise<Record<string, string>> {
  const unicos = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (unicos.length === 0) return {}

  const signed = await getStorageProvider().getSignedUrls('FOTOS_EMPLEADO', unicos, TTL_FOTO)
  return signed.ok ? signed.data : {}
}
