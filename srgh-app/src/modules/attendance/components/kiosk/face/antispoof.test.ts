import { describe, expect, it } from 'vitest'
import {
  ANTISPOOF_INPUT,
  ANTISPOOF_SCALE,
  REAL_CLASS_INDEX,
  antispoofCropBox,
  landmarksBoundingBox,
  preprocess,
  realnessFromLogits,
  softmax,
} from './antispoof'

describe('REAL_CLASS_INDEX', () => {
  /**
   * LA CONSTANTE MAS PELIGROSA DEL MODULO. La ficha del modelo publicada rio
   * abajo dice que la clase real es la 0; el test.py oficial de minivision y
   * la verificacion empirica contra sus imagenes de muestra dicen que es la 1.
   * Si alguien la "corrige" siguiendo la ficha, el kiosco queda INVERTIDO:
   * acepta fotos y rechaza personas. Esta prueba existe para que ese cambio no
   * pase en silencio.
   */
  it('la clase real es la 1, no la 0 (ver nota de convencion)', () => {
    expect(REAL_CLASS_INDEX).toBe(1)
  })

  it('los logits medidos de un rostro real dan realness alta', () => {
    // Salida real del modelo para image_T1.jpg (rostro real verificado).
    expect(realnessFromLogits([-4.738, 5.772, -1.038])!).toBeGreaterThan(0.99)
  })

  it('los logits medidos de una foto de una foto dan realness baja', () => {
    // Salida real del modelo para image_F1.jpg (foto impresa) y image_F2.
    expect(realnessFromLogits([-0.206, -2.098, 2.305])!).toBeLessThan(0.05)
    expect(realnessFromLogits([-4.055, -2.116, 6.173])!).toBeLessThan(0.01)
  })
})

describe('softmax', () => {
  it('suma 1', () => {
    const s = softmax([1, 2, 3])
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('conserva el orden', () => {
    const s = softmax([-4.738, 5.772, -1.038])
    expect(s.indexOf(Math.max(...s))).toBe(1)
  })

  it('es estable con valores grandes (no desborda)', () => {
    const s = softmax([1000, 1001, 999])
    expect(s.every((v) => Number.isFinite(v))).toBe(true)
    expect(s[1]).toBeGreaterThan(s[0])
  })

  it('tolera una lista vacia', () => {
    expect(softmax([])).toEqual([])
  })
})

describe('realnessFromLogits', () => {
  it('rechaza salidas que no tengan 3 clases', () => {
    expect(realnessFromLogits([1, 2])).toBeNull()
    expect(realnessFromLogits([1, 2, 3, 4])).toBeNull()
  })

  it('rechaza salidas con valores no finitos', () => {
    expect(realnessFromLogits([1, Number.NaN, 3])).toBeNull()
    expect(realnessFromLogits([1, Number.POSITIVE_INFINITY, 3])).toBeNull()
  })
})

describe('landmarksBoundingBox', () => {
  it('convierte landmarks normalizados a pixeles', () => {
    const box = landmarksBoundingBox(
      [
        { x: 0.25, y: 0.1 },
        { x: 0.75, y: 0.5 },
      ],
      640,
      480
    )!
    expect(box.x).toBeCloseTo(160)
    expect(box.y).toBeCloseTo(48)
    expect(box.width).toBeCloseTo(320)
    expect(box.height).toBeCloseTo(192)
  })

  it('devuelve null sin landmarks o con frame invalido', () => {
    expect(landmarksBoundingBox([], 640, 480)).toBeNull()
    expect(landmarksBoundingBox([{ x: 0.5, y: 0.5 }], 0, 480)).toBeNull()
  })

  it('devuelve null si todos los puntos coinciden (caja sin area)', () => {
    expect(landmarksBoundingBox([{ x: 0.5, y: 0.5 }], 640, 480)).toBeNull()
  })
})

describe('antispoofCropBox', () => {
  it('expande la caja por el factor de escala', () => {
    const box = antispoofCropBox({ x: 300, y: 200, width: 100, height: 100 }, 1920, 1080, 2.7)!
    expect(box.width).toBeCloseTo(270)
    expect(box.height).toBeCloseTo(270)
    // Centrada en el mismo punto que la original.
    expect(box.x + box.width / 2).toBeCloseTo(350)
    expect(box.y + box.height / 2).toBeCloseTo(250)
  })

  it('CONSERVA la relacion de aspecto en vez de volverla cuadrada', () => {
    // El modelo se entreno asi; forzar un cuadrado le cambia la entrada.
    const box = antispoofCropBox({ x: 400, y: 300, width: 100, height: 200 }, 1920, 1080, 2)!
    expect(box.width).toBeCloseTo(200)
    expect(box.height).toBeCloseTo(400)
  })

  it('DESPLAZA hacia adentro cuando se sale por un borde, sin encoger', () => {
    // Caja pegada al borde izquierdo: la expansion no cabe hacia la izquierda.
    const box = antispoofCropBox({ x: 10, y: 300, width: 100, height: 100 }, 1920, 1080, 2.7)!
    expect(box.x).toBeCloseTo(0)
    // El tamano se conserva pese al desplazamiento.
    expect(box.width).toBeCloseTo(270)
  })

  it('limita la escala para que la caja quepa en el frame', () => {
    // Un rostro que ocupa casi todo el alto no puede expandirse 2.7 veces.
    const box = antispoofCropBox({ x: 100, y: 10, width: 200, height: 400 }, 640, 480, 2.7)!
    expect(box.height).toBeLessThanOrEqual(479)
    expect(box.width).toBeLessThanOrEqual(639)
  })

  it('nunca devuelve coordenadas negativas', () => {
    const box = antispoofCropBox({ x: 0, y: 0, width: 50, height: 50 }, 100, 100, 2.7)!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
  })

  it('rechaza cajas o frames degenerados', () => {
    expect(antispoofCropBox({ x: 0, y: 0, width: 0, height: 10 }, 640, 480)).toBeNull()
    expect(antispoofCropBox({ x: 0, y: 0, width: 10, height: 10 }, 1, 480)).toBeNull()
  })

  it('usa 2.7 por defecto, el valor del checkpoint oficial', () => {
    const conDefault = antispoofCropBox({ x: 300, y: 200, width: 100, height: 100 }, 1920, 1080)!
    const explicito = antispoofCropBox(
      { x: 300, y: 200, width: 100, height: 100 },
      1920,
      1080,
      ANTISPOOF_SCALE
    )!
    expect(conDefault).toEqual(explicito)
    expect(ANTISPOOF_SCALE).toBe(2.7)
  })
})

describe('preprocess', () => {
  /** ImageData sintetico donde cada pixel tiene un color distinto y conocido. */
  function image(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = i % 256 // R
      data[i * 4 + 1] = (i * 2) % 256 // G
      data[i * 4 + 2] = (i * 3) % 256 // B
      data[i * 4 + 3] = 255
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData
  }

  it('produce un tensor NCHW del tamano correcto', () => {
    const out = preprocess(image(4, 4))
    expect(out).toHaveLength(3 * 16)
  })

  it('ordena los canales como BGR, no RGB', () => {
    // Con RGB el modelo clasifica TODO como real: el orden no es cosmetico.
    const out = preprocess(image(2, 2))
    const pixels = 4
    // Pixel 0: R=0, G=0, B=0. Pixel 1: R=1, G=2, B=3.
    expect(out[1]).toBe(3) // plano 0 = B
    expect(out[pixels + 1]).toBe(2) // plano 1 = G
    expect(out[2 * pixels + 1]).toBe(1) // plano 2 = R
  })

  it('NO normaliza a 0..1 — el grafo ONNX ya lleva esa escala', () => {
    // Dividir aca satura la red y devuelve la misma salida para cualquier
    // imagen. Verificado empiricamente contra las muestras oficiales.
    const data = new Uint8ClampedArray([200, 150, 100, 255])
    const out = preprocess({ data, width: 1, height: 1, colorSpace: 'srgb' } as ImageData)
    expect(out[0]).toBe(100) // B crudo
    expect(out[1]).toBe(150) // G crudo
    expect(out[2]).toBe(200) // R crudo
  })

  it('ignora el canal alfa', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 0])
    const out = preprocess({ data, width: 1, height: 1, colorSpace: 'srgb' } as ImageData)
    expect(Array.from(out)).toEqual([30, 20, 10])
  })

  it('maneja el tamano real de entrada del modelo', () => {
    const out = preprocess(image(ANTISPOOF_INPUT, ANTISPOOF_INPUT))
    expect(out).toHaveLength(3 * ANTISPOOF_INPUT * ANTISPOOF_INPUT)
  })
})
