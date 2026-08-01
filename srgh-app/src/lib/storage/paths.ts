// ─── Construcción y verificación de rutas multi-tenant ───────────────────────
// EL PRIMER SEGMENTO DE TODA RUTA ES SIEMPRE <empresaId>: las policies RLS de
// storage.objects comparan (storage.foldername(name))[1] contra
// get_empresa_id() del JWT. Cambiar esta convención rompe el aislamiento
// entre empresas — es la línea que separa Celulares Alex de Infinity.
//
// Los nombres de archivo son SIEMPRE UUID + extensión canónica: el nombre
// original que manda el usuario jamás se usa como ruta (entrada hostil:
// traversal, unicode, dobles extensiones — se maneja en fase 1B como metadato).

/** `<empresaId>/_lab/<uuid>.<ext>` — archivos del laboratorio temporal (fase 1). */
export function buildLabPath(empresaId: number, extension: string): string {
  return `${empresaId}/_lab/${crypto.randomUUID()}.${extension}`
}

/** `<empresaId>/empleados/<empId>/<uuid>.<ext>` — foto de empleado (la usa la fase 2). */
export function buildEmployeePhotoPath(
  empresaId: number,
  empleadoId: number,
  extension: string
): string {
  return `${empresaId}/empleados/${empleadoId}/${crypto.randomUUID()}.${extension}`
}

/**
 * Guard para TODA ruta que llegue del cliente (ver/borrar): además de la
 * policy RLS, el servidor verifica que la ruta pertenezca a la empresa del
 * JWT antes de tocar el proveedor. Doble candado a propósito.
 *
 * Rechaza cualquier intento de traversal o segmento vacío — las rutas
 * legítimas las construye siempre este archivo y nunca contienen `.`/`..`.
 */
export function pathBelongsToEmpresa(path: string, empresaId: number): boolean {
  const segments = path.split('/')

  if (segments.length < 2) {
    return false
  }
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false
  }

  return segments[0] === String(empresaId)
}

const MAX_FILE_NAME_LENGTH = 120

/**
 * Sanitiza el nombre ORIGINAL de un archivo subido por el usuario — entrada
 * hostil (traversal, unicode raro, bytes de control). El resultado se usa
 * SOLO para mostrar y para el Content-Disposition de la descarga (downloadAs);
 * jamás como ruta en el proveedor (las rutas son siempre UUID, ver arriba).
 */
export function sanitizeFileName(name: string): string {
  let clean = name
    .normalize('NFC')
    // Separadores de ruta, bytes de control e invalidos en Windows.
    .replace(/[/\\<>:"|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Puntos/espacios al inicio y al final: aqui mueren los `..` de traversal
    // y los nombres tipo `.htaccess` quedan con base visible.
    .replace(/^[.\s]+|[.\s]+$/g, '')

  if (clean.length > MAX_FILE_NAME_LENGTH) {
    // Recorta preservando la extension (si la hay y es razonable).
    const dotIndex = clean.lastIndexOf('.')
    const extension = dotIndex > 0 && clean.length - dotIndex <= 10 ? clean.slice(dotIndex) : ''
    clean = clean.slice(0, MAX_FILE_NAME_LENGTH - extension.length).trimEnd() + extension
  }

  return clean === '' ? 'documento' : clean
}
