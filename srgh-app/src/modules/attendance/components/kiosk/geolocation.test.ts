import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentCoordinates } from './geolocation'

describe('getCurrentCoordinates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resuelve las coordenadas cuando el navegador las concede', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: { latitude: 9.9333, longitude: -84.0833 },
          } as GeolocationPosition)
        },
      },
    })

    const result = await getCurrentCoordinates()

    expect(result).toEqual({ latitud: 9.9333, longitud: -84.0833 })
  })

  it('resuelve null cuando el usuario niega el permiso', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'denied' } as GeolocationPositionError)
        },
      },
    })

    const result = await getCurrentCoordinates()

    expect(result).toBeNull()
  })

  it('resuelve null cuando el navegador no tiene geolocalizacion', async () => {
    vi.stubGlobal('navigator', {})

    const result = await getCurrentCoordinates()

    expect(result).toBeNull()
  })
})
