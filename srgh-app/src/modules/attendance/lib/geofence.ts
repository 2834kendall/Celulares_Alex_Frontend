const EARTH_RADIUS_METERS = 6371000

/**
 * Distancia entre dos coordenadas (formula de Haversine), en metros.
 * Uso: comparar la marca del kiosco contra la ubicacion de la sucursal.
 * Es solo informativo — no rechaza marcas fuera de radio, nadie especifico
 * esa regla; el dato queda guardado en mar_distancia_geocerca_metros.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}
