import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  darken,
  deriveFrameTokens,
  derivePageBackground,
  deriveSidebarTokens,
  lighten,
  relativeLuminance,
  suggestAccent,
} from './color'

describe('darken/lighten', () => {
  it('darken(amount=0) y lighten(amount=0) no cambian el color', () => {
    expect(darken('#0891b2', 0)).toBe('#0891b2')
    expect(lighten('#0891b2', 0)).toBe('#0891b2')
  })

  it('darken(amount=1) llega a negro', () => {
    expect(darken('#0891b2', 1)).toBe('#000000')
  })

  it('lighten(amount=1) llega a blanco', () => {
    expect(lighten('#0891b2', 1)).toBe('#ffffff')
  })
})

describe('relativeLuminance', () => {
  it('blanco es 1, negro es 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('distingue un gris claro de uno oscuro', () => {
    expect(relativeLuminance('#ececef')).toBeGreaterThan(0.5)
    expect(relativeLuminance('#1b2a41')).toBeLessThan(0.5)
  })
})

describe('deriveFrameTokens', () => {
  it('el color elegido queda como el paso 600 (boton primario)', () => {
    const tokens = deriveFrameTokens('#0891b2')
    expect(tokens['--color-frame-600']).toBe('#0891b2')
  })

  it('el paso 500 es mas luminoso y los pasos 700/800 son mas oscuros que el color elegido', () => {
    const tokens = deriveFrameTokens('#0891b2')
    const base = relativeLuminance('#0891b2')

    expect(relativeLuminance(tokens['--color-frame-500'])).toBeGreaterThan(base)
    expect(relativeLuminance(tokens['--color-frame-700'])).toBeLessThan(base)
    expect(relativeLuminance(tokens['--color-frame-800'])).toBeLessThan(base)
  })

  it('el paso 800 es mas oscuro que el 700', () => {
    const tokens = deriveFrameTokens('#0891b2')
    expect(relativeLuminance(tokens['--color-frame-800'])).toBeLessThan(
      relativeLuminance(tokens['--color-frame-700'])
    )
  })
})

describe('derivePageBackground', () => {
  it('es mucho mas luminoso que el color elegido, para no competir con las tarjetas', () => {
    for (const acento of ['#dc2626', '#0891b2', '#166534', '#5b21b6']) {
      expect(relativeLuminance(derivePageBackground(acento))).toBeGreaterThan(
        relativeLuminance(acento)
      )
      expect(relativeLuminance(derivePageBackground(acento))).toBeGreaterThan(0.8)
    }
  })

  it('conserva un matiz distinto entre acentos distintos (no colapsa a un solo gris)', () => {
    const rojo = derivePageBackground('#dc2626')
    const azul = derivePageBackground('#1e40af')
    expect(rojo).not.toBe(azul)
  })
})

describe('deriveSidebarTokens', () => {
  it('con un fondo claro, el texto queda oscuro', () => {
    const tokens = deriveSidebarTokens('#ececef')
    expect(relativeLuminance(tokens['--sidebar-text-strong'])).toBeLessThan(
      relativeLuminance(tokens['--sidebar-bg'])
    )
  })

  it('con un fondo oscuro, el texto queda claro', () => {
    const tokens = deriveSidebarTokens('#1b2a41')
    expect(relativeLuminance(tokens['--sidebar-text-strong'])).toBeGreaterThan(
      relativeLuminance(tokens['--sidebar-bg'])
    )
  })

  it('el fondo se conserva tal cual se paso', () => {
    expect(deriveSidebarTokens('#42454a')['--sidebar-bg']).toBe('#42454a')
  })
})

describe('contrastRatio', () => {
  it('blanco contra negro da el maximo (21)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('un color contra si mismo da el minimo (1)', () => {
    expect(contrastRatio('#0891b2', '#0891b2')).toBeCloseTo(1, 5)
  })

  it('es simetrico', () => {
    expect(contrastRatio('#eef1f4', '#1b2a41')).toBeCloseTo(contrastRatio('#1b2a41', '#eef1f4'), 10)
  })
})

describe('suggestAccent', () => {
  it('siempre devuelve un hex valido', () => {
    for (const fondo of ['#eef1f4', '#1b2a41', '#42454a', '#f1efe8', '#15181d', '#ececef']) {
      expect(suggestAccent(fondo)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('el sugerido se distingue del fondo pero sin contraste extremo (nunca chillon)', () => {
    for (const fondo of ['#eef1f4', '#1b2a41', '#42454a', '#f1efe8', '#15181d', '#ececef']) {
      const contraste = contrastRatio(suggestAccent(fondo), fondo)
      expect(contraste).toBeGreaterThan(1.8)
      expect(contraste).toBeLessThan(3.5)
    }
  })

  it('es deterministico: mismo fondo, misma sugerencia', () => {
    expect(suggestAccent('#eef1f4')).toBe(suggestAccent('#eef1f4'))
  })
})
