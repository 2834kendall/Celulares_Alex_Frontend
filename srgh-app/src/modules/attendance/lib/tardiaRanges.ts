/**
 * Texto del rango que cubre un tipo de tardia, deducido del minuto donde
 * empieza y del minuto donde empieza el SIGUIENTE (null si es el ultimo).
 *
 * El catalogo solo guarda comienzos; el rango completo existe solo para
 * mostrarselo al administrador, que es quien tiene que entender que va a
 * pasar con un atraso de, digamos, 7 minutos.
 */
export function rangeLabel(desde: number, siguienteDesde: number | null): string {
  if (siguienteDesde === null) return `${desde} min o mas`

  const hasta = siguienteDesde - 1
  return hasta === desde ? `${desde} min` : `${desde} a ${hasta} min`
}

/** Los tipos ordenados, cada uno con el comienzo del siguiente al lado. */
export function withNextStart<T extends { tta_desde_minutos: number }>(
  tipos: T[]
): { tipo: T; siguienteDesde: number | null }[] {
  const ordenados = [...tipos].sort((a, b) => a.tta_desde_minutos - b.tta_desde_minutos)

  return ordenados.map((tipo, i) => ({
    tipo,
    siguienteDesde: ordenados[i + 1]?.tta_desde_minutos ?? null,
  }))
}
