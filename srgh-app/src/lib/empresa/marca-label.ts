function mismoNombre(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

/**
 * Cómo se muestra una sucursal en toda la app: "Marca · Sucursal".
 *
 * Si la sucursal no tiene marca, o se llama igual que su marca (es el caso de
 * las sucursales de producción recién migradas, hasta que alguien las
 * renombre, p. ej. a "Mall"), se muestra un solo nombre: "Celulares Alex ·
 * Celulares Alex" no le dice nada a nadie.
 */
export function formatSucursalLabel(
  marcaNombre: string | null | undefined,
  sucursalNombre: string
): string {
  if (!marcaNombre || mismoNombre(marcaNombre, sucursalNombre)) return sucursalNombre
  return `${marcaNombre} · ${sucursalNombre}`
}

/** Lo que trae un select embebido `sgrh_sucursales ( suc_nombre, sgrh_marcas_comerciales ( mco_nombre ) )`. */
export type SucursalConMarcaJoin = {
  suc_nombre: string | null
  sgrh_marcas_comerciales?: { mco_nombre: string } | null
}

/** `formatSucursalLabel` sobre un join de sucursal; null si no hay sucursal. */
export function sucursalLabel(sucursal: SucursalConMarcaJoin | null | undefined): string | null {
  if (!sucursal?.suc_nombre) return null
  return formatSucursalLabel(sucursal.sgrh_marcas_comerciales?.mco_nombre, sucursal.suc_nombre)
}

/**
 * Las dos líneas de la identidad del shell (logo + nombre + detalle):
 *
 * - con marca: el nombre de la marca, y debajo la sucursal propia o, si no
 *   hay (un admin mirando una marca), el nombre de la empresa;
 * - sin marca: el nombre de la empresa, y debajo la sucursal (o nada).
 *
 * Una línea que repetiría a la de arriba se omite (null): el componente cae
 * ahí al nombre del sistema.
 */
export function shellIdentity(
  empresaNombre: string,
  marcaNombre: string | null,
  sucursalNombre: string | null
): { nombre: string; detalle: string | null } {
  const nombre = marcaNombre ?? empresaNombre
  const detalle = sucursalNombre ?? (marcaNombre ? empresaNombre : null)
  return { nombre, detalle: detalle && !mismoNombre(detalle, nombre) ? detalle : null }
}
