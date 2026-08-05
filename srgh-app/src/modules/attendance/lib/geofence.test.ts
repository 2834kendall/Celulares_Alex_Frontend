import { describe, expect, it } from 'vitest'
import { haversineDistanceMeters } from './geofence'

describe('haversineDistanceMeters', () => {
  it('es cero para el mismo punto', () => {
    expect(haversineDistanceMeters(9.9333, -84.0833, 9.9333, -84.0833)).toBe(0)
  })

  it('un grado de latitud equivale a aproximadamente 111.2 km', () => {
    expect(haversineDistanceMeters(0, 0, 1, 0)).toBeCloseTo(111194.93, 1)
  })

  it('calcula una distancia corta (metros) de forma simetrica', () => {
    const a = haversineDistanceMeters(9.9333, -84.0833, 9.9338, -84.0833)
    const b = haversineDistanceMeters(9.9338, -84.0833, 9.9333, -84.0833)

    expect(a).toBeCloseTo(b, 6)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(100)
  })
})
