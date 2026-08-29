import { describe, expect, it } from 'vitest'
import {
  assessQuality,
  faceCoverage,
  frontalityOffset,
  isCropped,
  qualityMessage,
  rollAngle,
  sharpnessScore,
  type Point2D,
} from './quality'

/**
 * Construye un juego minimo de landmarks con los indices que quality.ts mira.
 * El resto queda vacio a proposito: las funciones deben tolerar una malla
 * incompleta sin reventar.
 */
function landmarks(overrides: Partial<Record<number, Point2D>> = {}): Point2D[] {
  const base: Point2D[] = new Array(478)
  base[33] = { x: 0.4, y: 0.45 } // ojo derecho externo
  base[263] = { x: 0.6, y: 0.45 } // ojo izquierdo externo
  base[1] = { x: 0.5, y: 0.55 } // punta de nariz
  base[10] = { x: 0.5, y: 0.2 } // frente
  base[152] = { x: 0.5, y: 0.8 } // menton

  for (const [index, point] of Object.entries(overrides)) {
    base[Number(index)] = point as Point2D
  }
  return base
}

describe('frontalityOffset', () => {
  it('vale cero con la nariz centrada entre los ojos', () => {
    expect(frontalityOffset(landmarks())).toBeCloseTo(0, 10)
  })

  it('crece al correr la nariz hacia un lado', () => {
    const girado = frontalityOffset(landmarks({ 1: { x: 0.56, y: 0.55 } }))!
    expect(girado).toBeCloseTo(0.3, 6)
  })

  it('es simetrico: da lo mismo girar a un lado que al otro', () => {
    const derecha = frontalityOffset(landmarks({ 1: { x: 0.56, y: 0.55 } }))
    const izquierda = frontalityOffset(landmarks({ 1: { x: 0.44, y: 0.55 } }))
    expect(derecha).toBeCloseTo(izquierda!, 10)
  })

  it('no confunde una cabeza INCLINADA con una GIRADA', () => {
    // Ojos rotados 30 grados y nariz desplazada de forma coherente con esa
    // rotacion: sigue siendo un rostro frontal, solo que ladeado.
    const angle = Math.PI / 6
    const half = 0.1
    const cx = 0.5
    const cy = 0.45

    const right = { x: cx - half * Math.cos(angle), y: cy - half * Math.sin(angle) }
    const left = { x: cx + half * Math.cos(angle), y: cy + half * Math.sin(angle) }
    // La nariz baja por el eje perpendicular al de los ojos.
    const nose = { x: cx + 0.1 * Math.sin(angle), y: cy - 0.1 * Math.cos(angle) }

    const offset = frontalityOffset(landmarks({ 33: right, 263: left, 1: nose }))
    expect(offset).toBeCloseTo(0, 6)
  })

  it('devuelve null si faltan puntos de referencia', () => {
    expect(frontalityOffset(new Array(478))).toBeNull()
  })
})

describe('rollAngle', () => {
  it('vale cero con los ojos nivelados', () => {
    expect(rollAngle(landmarks())).toBeCloseTo(0, 10)
  })

  it('mide la inclinacion de la linea entre los ojos', () => {
    const tilted = rollAngle(landmarks({ 263: { x: 0.6, y: 0.55 } }))!
    expect(tilted).toBeCloseTo(Math.atan2(0.1, 0.2), 6)
  })

  it('devuelve null si faltan los ojos', () => {
    expect(rollAngle(new Array(478))).toBeNull()
  })
})

describe('faceCoverage', () => {
  it('mide de frente a menton', () => {
    expect(faceCoverage(landmarks())).toBeCloseTo(0.6, 10)
  })

  it('baja cuando el rostro esta lejos', () => {
    const lejos = faceCoverage(landmarks({ 10: { x: 0.5, y: 0.45 }, 152: { x: 0.5, y: 0.6 } }))
    expect(lejos).toBeCloseTo(0.15, 10)
  })
})

describe('isCropped', () => {
  it('detecta un punto fuera del margen', () => {
    expect(isCropped(landmarks({ 152: { x: 0.5, y: 0.995 } }), 0.02)).toBe(true)
  })

  it('acepta un rostro dentro del encuadre', () => {
    expect(isCropped(landmarks(), 0.02)).toBe(false)
  })

  it('ignora huecos de la malla', () => {
    const sparse: Point2D[] = new Array(478)
    sparse[1] = { x: 0.5, y: 0.5 }
    expect(isCropped(sparse, 0.02)).toBe(false)
  })
})

describe('assessQuality', () => {
  it('aprueba un encuadre correcto', () => {
    const report = assessQuality(landmarks())!
    expect(report.ok).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('rechaza un rostro demasiado lejos', () => {
    const report = assessQuality(landmarks({ 10: { x: 0.5, y: 0.45 }, 152: { x: 0.5, y: 0.6 } }))!
    expect(report.ok).toBe(false)
    expect(report.issues).toContain('rostro_lejos')
  })

  it('rechaza un rostro muy de perfil', () => {
    const report = assessQuality(landmarks({ 1: { x: 0.57, y: 0.55 } }))!
    expect(report.issues).toContain('rostro_girado')
  })

  it('rechaza una cabeza muy inclinada', () => {
    const report = assessQuality(landmarks({ 263: { x: 0.58, y: 0.53 } }))!
    expect(report.issues).toContain('rostro_inclinado')
  })

  it('acumula todos los problemas, no solo el primero', () => {
    const report = assessQuality(
      landmarks({
        10: { x: 0.5, y: 0.45 },
        152: { x: 0.5, y: 0.6 },
        1: { x: 0.57, y: 0.55 },
      })
    )!
    expect(report.issues).toContain('rostro_lejos')
    expect(report.issues).toContain('rostro_girado')
  })

  it('devuelve null con una malla sin los puntos necesarios', () => {
    expect(assessQuality(new Array(478))).toBeNull()
  })

  it('respeta umbrales personalizados', () => {
    const strict = assessQuality(landmarks(), { minCoverage: 0.9 })!
    expect(strict.issues).toContain('rostro_lejos')
  })
})

describe('qualityMessage', () => {
  it('prioriza la cercania sobre lo demas', () => {
    expect(qualityMessage(['rostro_girado', 'rostro_lejos'])).toBe(
      'Acercate un poco mas a la camara'
    )
  })

  it('devuelve null si no hay problemas', () => {
    expect(qualityMessage([])).toBeNull()
  })
})

describe('sharpnessScore', () => {
  /** Imagen sintetica: `fn` da la luminancia de cada pixel. */
  function image(size: number, fn: (x: number, y: number) => number): ImageData {
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = fn(x, y)
        const i = (y * size + x) * 4
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
    }
    return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData
  }

  it('da cero en una imagen plana', () => {
    expect(sharpnessScore(image(16, () => 128))).toBeCloseTo(0, 6)
  })

  it('da un valor alto en un patron de alto contraste', () => {
    const tablero = image(16, (x, y) => ((x + y) % 2 === 0 ? 0 : 255))
    expect(sharpnessScore(tablero)).toBeGreaterThan(10_000)
  })

  it('distingue una imagen nitida de una borrosa', () => {
    const nitida = image(32, (x) => (x % 8 < 4 ? 30 : 220))
    // Misma estructura pero con transiciones suavizadas.
    const borrosa = image(32, (x) => 125 + 95 * Math.sin((x * Math.PI) / 4))
    expect(sharpnessScore(nitida)).toBeGreaterThan(sharpnessScore(borrosa))
  })

  it('tolera imagenes degeneradas', () => {
    expect(sharpnessScore(image(2, () => 100))).toBe(0)
  })
})
