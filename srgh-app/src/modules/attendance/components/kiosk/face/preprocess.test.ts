import { describe, expect, it } from 'vitest'
import { rgbaToNchwFloat32 } from './preprocess'

describe('rgbaToNchwFloat32', () => {
  it('separa los canales en planos NCHW y normaliza a ~[-1, 1]', () => {
    // Frame de 2x2 (size=2) con pixeles conocidos.
    const rgba = new Uint8ClampedArray([
      // (R, G, B, A) por pixel
      255,
      0,
      0,
      255, // rojo
      0,
      255,
      0,
      255, // verde
      0,
      0,
      255,
      255, // azul
      127.5,
      127.5,
      127.5,
      255, // gris medio (se redondea a 128)
    ])

    const out = rgbaToNchwFloat32(rgba, 2)

    expect(out).toHaveLength(3 * 4)

    // Plano R: [rojo=1, verde≈-1, azul≈-1, gris≈0]
    expect(out[0]).toBeCloseTo((255 - 127.5) / 128)
    expect(out[1]).toBeCloseTo((0 - 127.5) / 128)
    // Plano G (offset 4): verde=máximo en el segundo pixel
    expect(out[4 + 1]).toBeCloseTo((255 - 127.5) / 128)
    // Plano B (offset 8): azul=máximo en el tercer pixel
    expect(out[8 + 2]).toBeCloseTo((255 - 127.5) / 128)
    // El alfa NO participa.
    expect(out[3]).toBeCloseTo((128 - 127.5) / 128)
  })

  it('lanza si el buffer no corresponde al tamaño esperado', () => {
    expect(() => rgbaToNchwFloat32(new Uint8ClampedArray(10), 2)).toThrow(/Recorte facial/)
  })

  it('acepta el tamaño real del modelo (112x112)', () => {
    const rgba = new Uint8ClampedArray(112 * 112 * 4)
    const out = rgbaToNchwFloat32(rgba)
    expect(out).toHaveLength(3 * 112 * 112)
  })
})
