/**
 * `items.map(fn)` con, como mucho, `limite` llamadas en vuelo a la vez. Los
 * resultados vuelven en el mismo orden que `items`.
 *
 * Para trabajo por fila que antes corría en serie (un viaje a la base detrás
 * de otro por cada empleado) y que no comparte filas entre sí: cada fila de
 * planilla escribe solo su detalle, sus líneas y su movimiento del banco de
 * horas (UNIQUE por detalle). El límite evita lanzar 60 consultas de golpe
 * contra la base.
 */
export async function mapConLimite<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados = new Array<R>(items.length)
  let siguiente = 0

  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente
      siguiente += 1
      resultados[i] = await fn(items[i], i)
    }
  }

  const cantidad = Math.max(1, Math.min(limite, items.length))
  await Promise.all(Array.from({ length: cantidad }, () => trabajador()))
  return resultados
}

/** Filas de planilla que se procesan a la vez (ver mapConLimite). */
export const FILAS_EN_PARALELO = 4
