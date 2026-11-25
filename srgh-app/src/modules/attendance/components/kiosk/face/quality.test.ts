import { describe, expect, it } from 'vitest'
import {
  assessQuality,
  DARK_EYES_RATIO,
  eyeShade,
  looksLikeDarkGlasses,
  faceCoverage,
  faceInsideOval,
  frontalityOffset,
  handCoversFace,
  isCropped,
  ovalInVideo,
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
      'Acércate un poco más a la cámara'
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

describe('handCoversFace', () => {
  // Rostro de 0.3 a 0.7 en ambos ejes.
  const face: Point2D[] = [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.5, y: 0.5 },
    { x: 0.3, y: 0.7 },
    { x: 0.7, y: 0.7 },
  ]
  const hand = (inside: number): Point2D[] =>
    Array.from({ length: 21 }, (_, i) => (i < inside ? { x: 0.5, y: 0.5 } : { x: 0.9, y: 0.9 }))

  it('detecta una mano con varios puntos sobre la cara', () => {
    expect(handCoversFace(face, [hand(8)])).toBe(true)
  })

  it('tolera una mano que solo roza el borde', () => {
    expect(handCoversFace(face, [hand(2)])).toBe(false)
  })

  it('no marca nada sin manos o con la mano lejos', () => {
    expect(handCoversFace(face, [])).toBe(false)
    expect(handCoversFace(face, [hand(0)])).toBe(false)
  })

  it('alcanza con que una de dos manos tape la cara', () => {
    expect(handCoversFace(face, [hand(0), hand(5)])).toBe(true)
  })

  it('sin puntos del rostro no puede decidir y no bloquea', () => {
    expect(handCoversFace([], [hand(21)])).toBe(false)
  })
})

describe('óvalo de la pantalla', () => {
  const shift = (points: Point2D[], dx: number) =>
    points.map((p) => (p ? { x: p.x + dx, y: p.y } : p))

  it('traduce el óvalo al cuadro real según la proporción de la cámara', () => {
    expect(ovalInVideo(640, 480)).toEqual({ cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.375 })
    // 16:9 recortado a 4:3: los costados no se ven, el óvalo es más angosto.
    expect(ovalInVideo(1280, 720).rx).toBeCloseTo(0.1875)
    expect(ovalInVideo(1280, 720).ry).toBeCloseTo(0.375)
    // Vertical (teléfono): se recorta arriba y abajo.
    expect(ovalInVideo(480, 640).rx).toBeCloseTo(0.25)
    expect(ovalInVideo(480, 640).ry).toBeCloseTo(0.2109, 3)
    // Sin medidas todavía: el óvalo de la pantalla tal cual.
    expect(ovalInVideo(0, 0)).toEqual({ cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.375 })
  })

  it('acepta un rostro centrado y rechaza uno corrido fuera del óvalo', () => {
    const oval = ovalInVideo(640, 480)
    expect(assessQuality(landmarks(), { oval })!.ok).toBe(true)
    expect(faceInsideOval(shift(landmarks(), 0.25), oval)).toBe(false)
    const report = assessQuality(shift(landmarks(), 0.25), { oval })!
    expect(report.issues).toContain('fuera_del_ovalo')
    expect(qualityMessage(report.issues)).toBe('Coloca tu rostro dentro del óvalo')
  })

  it('pide alejarse si el rostro es más alto que el óvalo', () => {
    const oval = ovalInVideo(640, 480)
    const report = assessQuality(landmarks({ 10: { x: 0.5, y: 0.03 }, 152: { x: 0.5, y: 0.97 } }), {
      oval,
    })!
    expect(report.issues).toContain('rostro_cerca')
    expect(report.issues).not.toContain('fuera_del_ovalo')
    expect(qualityMessage(report.issues)).toBe('Aléjate un poco de la cámara')
  })

  it('sin óvalo se comporta como antes', () => {
    expect(assessQuality(shift(landmarks(), 0.25))!.issues).not.toContain('fuera_del_ovalo')
  })

  it('sin puntos no da el rostro por adentro', () => {
    expect(faceInsideOval([], ovalInVideo(640, 480))).toBe(false)
  })
})

describe('lentes oscuros (brillo de los ojos vs la piel)', () => {
  const W = 100
  const H = 100
  // Cara sintética: piel clara; cada ojo es una caja que se pinta aparte.
  const RIGHT = [33, 133, 159, 145, 160, 144, 158, 153]
  const LEFT = [263, 362, 386, 374, 387, 373, 385, 380]
  const face = (): Point2D[] => {
    const pts: Point2D[] = new Array(478)
    RIGHT.forEach((i, k) => (pts[i] = { x: 0.3 + (k % 2) * 0.1, y: 0.4 + (k % 3) * 0.02 }))
    LEFT.forEach((i, k) => (pts[i] = { x: 0.6 + (k % 2) * 0.1, y: 0.4 + (k % 3) * 0.02 }))
    pts[50] = { x: 0.3, y: 0.65 }
    pts[280] = { x: 0.7, y: 0.65 }
    pts[205] = { x: 0.33, y: 0.7 }
    pts[425] = { x: 0.67, y: 0.7 }
    pts[151] = { x: 0.5, y: 0.2 }
    return pts
  }
  function image(skin: number, rightEye: number, leftEye: number) {
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W
        const ny = y / H
        const inRight = nx >= 0.29 && nx <= 0.41 && ny >= 0.39 && ny <= 0.45
        const inLeft = nx >= 0.59 && nx <= 0.71 && ny >= 0.39 && ny <= 0.45
        const v = inRight ? rightEye : inLeft ? leftEye : skin
        const i = (y * W + x) * 4
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = 255
      }
    }
    return { data, width: W, height: H }
  }

  it('ojos descubiertos o con lentes claros: no los marca', () => {
    const shade = eyeShade(image(200, 140, 150), face())!
    expect(shade.right).toBeGreaterThan(DARK_EYES_RATIO)
    expect(looksLikeDarkGlasses(shade)).toBe(false)
  })

  it('lentes de sol: los dos ojos casi negros respecto de la piel', () => {
    const shade = eyeShade(image(200, 25, 30), face())!
    expect(shade.right).toBeLessThan(0.2)
    expect(looksLikeDarkGlasses(shade)).toBe(true)
  })

  it('una sombra sobre un solo ojo no alcanza', () => {
    expect(looksLikeDarkGlasses(eyeShade(image(200, 25, 150), face()))).toBe(false)
  })

  it('es relativo a la piel del mismo rostro, no a un brillo fijo', () => {
    // Piel morena y ojos descubiertos: misma proporción que piel clara.
    expect(looksLikeDarkGlasses(eyeShade(image(90, 65, 70), face()))).toBe(false)
  })

  it('sin puntos o sin piel medible no decide (no bloquea)', () => {
    expect(eyeShade(image(200, 25, 25), [])).toBeNull()
    expect(eyeShade(image(0, 0, 0), face())).toBeNull()
    expect(looksLikeDarkGlasses(null)).toBe(false)
  })
})
