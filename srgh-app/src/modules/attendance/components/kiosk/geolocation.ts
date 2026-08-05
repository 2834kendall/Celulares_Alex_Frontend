export interface Coordinates {
  latitud: number
  longitud: number
}

/**
 * Coordenadas del navegador para la marca — puramente informativas (no
 * bloquean el marcado). Si el usuario niega el permiso, el dispositivo no
 * tiene GPS, o tarda mas de 5s, se resuelve a null y la marca se guarda
 * igual, sin coordenadas.
 */
export function getCurrentCoordinates(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitud: position.coords.latitude, longitud: position.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    )
  })
}
