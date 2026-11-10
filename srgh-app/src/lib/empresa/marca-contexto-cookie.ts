/**
 * Marca que eligió el usuario en el selector de la barra superior. Es una
 * preferencia, no un permiso: el valor se revalida en cada lectura y solo achica
 * lo que la RLS ya deja ver (ver contexto-activo.ts).
 *
 * Recuerda DE QUIÉN es: en una máquina compartida, otra cuenta no hereda el
 * filtro aunque la sesión anterior haya vencido sin pasar por logout.
 */
export const MARCA_CONTEXTO_COOKIE = 'sgrh_marca_contexto'

/**
 * Un año, como la del dashboard. Si venciera antes con la pestaña abierta, la
 * página traería todo mientras el aviso del layout, que no se re-renderiza al
 * navegar, seguiría nombrando la marca.
 */
export const MARCA_CONTEXTO_MAX_AGE = 60 * 60 * 24 * 365

export function serializarMarcaContexto(usrId: number, marcaId: number): string {
  return JSON.stringify({ u: usrId, m: marcaId })
}

/** La marca guardada, o null si no hay, es de otro usuario o el valor no es válido. */
export function leerMarcaContexto(
  raw: string | undefined,
  usrId: number | null | undefined
): number | null {
  if (!raw || !usrId) return null

  try {
    const stored = JSON.parse(raw) as { u?: unknown; m?: unknown } | null
    if (stored?.u !== usrId) return null
    return Number.isInteger(stored.m) && (stored.m as number) > 0 ? (stored.m as number) : null
  } catch {
    return null
  }
}
