import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  darken,
  deriveBrandTokens,
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

/**
 * Los mismos seis acentos que ofrece el formulario de apariencia
 * (ver ACCENT_PRESETS en SucursalAppearanceForm). Son los unicos colores
 * que el producto propone, asi que son los que tienen que cumplir AA.
 */
const PRESETS_ACENTO = ['#0891b2', '#1e40af', '#166534', '#9f1239', '#5b21b6', '#334155']

describe('deriveBrandTokens', () => {
  it('el color elegido queda como el paso 600 (boton primario)', () => {
    const tokens = deriveBrandTokens('#0891b2')
    expect(tokens['--color-brand-600']).toBe('#0891b2')
  })

  it('el paso 500 es mas luminoso y los pasos 700/800 son mas oscuros que el color elegido', () => {
    const tokens = deriveBrandTokens('#0891b2')
    const base = relativeLuminance('#0891b2')

    expect(relativeLuminance(tokens['--color-brand-500'])).toBeGreaterThan(base)
    expect(relativeLuminance(tokens['--color-brand-700'])).toBeLessThan(base)
    expect(relativeLuminance(tokens['--color-brand-800'])).toBeLessThan(base)
  })

  it('el paso 800 es mas oscuro que el 700', () => {
    const tokens = deriveBrandTokens('#0891b2')
    expect(relativeLuminance(tokens['--color-brand-800'])).toBeLessThan(
      relativeLuminance(tokens['--color-brand-700'])
    )
  })

  /*
   * La escala se unifico con la del marco (antes `--color-frame-*`), asi que
   * ahora un solo color de sucursal tiene que servir para TODO: fondos suaves
   * (`bg-brand-50`), bordes (`border-brand-300`) y texto (`text-brand-700`).
   * Si la escala no fuera monotona, un `text-brand-700` sobre `bg-brand-50`
   * podria quedar ilegible para ciertos matices.
   */
  it('la escala es monotona: cada paso es mas oscuro que el anterior', () => {
    const pasos = [50, 100, 200, 300, 400, 500, 600, 700, 800] as const

    for (const acento of ['#0891b2', '#9f1239', '#166534', '#5b21b6', '#334155']) {
      const tokens = deriveBrandTokens(acento)
      const luminancias = pasos.map((p) => relativeLuminance(tokens[`--color-brand-${p}`]))

      for (let i = 1; i < luminancias.length; i++) {
        expect(luminancias[i]).toBeLessThan(luminancias[i - 1])
      }
    }
  })

  it('el paso 50 es casi blanco, para servir de fondo suave detras de texto', () => {
    for (const acento of ['#0891b2', '#9f1239', '#166534', '#5b21b6']) {
      const tokens = deriveBrandTokens(acento)
      expect(relativeLuminance(tokens['--color-brand-50'])).toBeGreaterThan(0.8)
    }
  })

  /*
   * Ahora esto SI comprueba WCAG AA de verdad.
   *
   * La version anterior de este test no podia: medía con un `contrastRatio`
   * que no aplicaba la correccion gamma sRGB y subestimaba el contraste
   * entre un 80% y un 195%. Con esos numeros la app parecia incumplir AA en
   * todos lados, asi que el test se habia dejado como un simple "no
   * empeorar respecto al cyan de Tailwind". Corregida la formula, el peor
   * preset (el cyan por defecto) da 4.63:1 y todos pasan.
   */
  it('text-brand-700 sobre bg-brand-50 cumple WCAG AA en los presets ofrecidos', () => {
    for (const acento of PRESETS_ACENTO) {
      const tokens = deriveBrandTokens(acento)
      const ratio = contrastRatio(tokens['--color-brand-700'], tokens['--color-brand-50'])
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  /*
   * Texto blanco sobre el acento: es el boton primario, el item activo del
   * menu y el avatar sin foto, o sea la combinacion mas repetida de la app.
   *
   * Se exige 3:1 (AA para texto grande) y no 4.5:1 porque hay un caso real
   * que no llega: el cyan por defecto (#0891b2) da 3.68:1. Los otros cinco
   * presets estan entre 7.1 y 10.4. Subir el minimo a 4.5 obligaria a
   * oscurecer el cyan, que es la identidad visual por defecto del producto —
   * decision de diseño, no de esta funcion. El test fija el piso para que si
   * alguien agrega un preset mas claro, salte aca y no en produccion.
   */
  it('texto blanco sobre el acento nunca baja de 3:1', () => {
    for (const acento of PRESETS_ACENTO) {
      const tokens = deriveBrandTokens(acento)
      expect(contrastRatio('#ffffff', tokens['--color-brand-600'])).toBeGreaterThanOrEqual(3)
      expect(contrastRatio('#ffffff', tokens['--color-brand-700'])).toBeGreaterThanOrEqual(3)
    }
  })
  it('el paso 600 es exactamente el color elegido, sin ajustar por contraste', () => {
    // El formulario de apariencia muestra este hex y el boton primario lo
    // pinta: si la derivacion lo "corrigiera", el color guardado y el
    // mostrado dejarian de coincidir.
    for (const acento of ['#0891b2', '#9f1239', '#eab308']) {
      expect(deriveBrandTokens(acento)['--color-brand-600']).toBe(acento)
    }
  })
})

describe('derivePageBackground', () => {
  it('es mucho mas luminoso que el color elegido, para no competir con las tarjetas', () => {
    for (const acento of ['#dc2626', '#0891b2', '#166534', '#5b21b6']) {
      expect(relativeLuminance(derivePageBackground(acento))).toBeGreaterThan(
        relativeLuminance(acento)
      )
      // 0.7 en luminancia WCAG: el fondo de pagina queda claro de sobra para
      // no competir con las tarjetas blancas, sin exigir que sea casi blanco
      // (el peor caso real, un granate, da 0.748).
      expect(relativeLuminance(derivePageBackground(acento))).toBeGreaterThan(0.7)
    }
  })

  it('conserva un matiz distinto entre acentos distintos (no colapsa a un solo gris)', () => {
    const rojo = derivePageBackground('#dc2626')
    const azul = derivePageBackground('#1e40af')
    expect(rojo).not.toBe(azul)
  })
})

/*
 * Valores de referencia calculados a mano con la formula de WCAG 2.x, para
 * detectar si alguien "simplifica" relativeLuminance y vuelve a quitarle la
 * linealizacion sRGB — que es exactamente el bug que tenia.
 */
describe('contrastRatio (WCAG 2.x)', () => {
  it('coincide con los valores de referencia de WCAG', () => {
    // Blanco sobre negro es el maximo posible: 21:1.
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    // Un color contra si mismo es 1:1.
    expect(contrastRatio('#0891b2', '#0891b2')).toBeCloseTo(1, 5)
  })

  it('aplica la correccion gamma sRGB (no promedia los canales crudos)', () => {
    /*
     * El caso que delata la formula vieja: sin linealizar, el gris medio
     * #808080 parece tener luminancia ~0.5 y da ~2.6:1 contra el blanco.
     * Con la curva gamma real su luminancia es ~0.216 y el contraste es
     * ~3.95:1. Si este test baja a ~2.6, alguien rompio la formula.
     */
    expect(contrastRatio('#ffffff', '#808080')).toBeGreaterThan(3.5)
    expect(relativeLuminance('#808080')).toBeLessThan(0.3)
  })

  it('es simetrico: el orden de los colores no cambia el resultado', () => {
    expect(contrastRatio('#0891b2', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#0891b2'), 10)
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
  /*
   * Regresion del umbral magico: la version anterior decidia la direccion
   * del texto con `relativeLuminance(hex) > 0.5`. Con la formula WCAG
   * correcta ese umbral se equivoca en los tonos medios — un gris #7a7a7a
   * cae por debajo de 0.5 ("oscuro") y habria recibido texto claro, que
   * sobre ese fondo contrasta 3.0:1, peor que el texto oscuro (4.4:1).
   * Ahora se elige comparando las dos opciones reales.
   */
  it('en un gris medio elige la direccion de texto que mas contrasta', () => {
    for (const gris of ['#7a7a7a', '#969696', '#8a8a8a', '#6f6f6f']) {
      const tokens = deriveSidebarTokens(gris)
      const elegido = contrastRatio(tokens['--sidebar-text-strong'], gris)
      const descartado = Math.min(
        contrastRatio(darken(gris, 0.85), gris),
        contrastRatio(lighten(gris, 0.94), gris)
      )
      expect(elegido).toBeGreaterThanOrEqual(descartado)
    }
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
      // Rango en escala WCAG (antes 1.8-3.5 en la escala subestimada).
      // Se distingue del fondo, pero deliberadamente por DEBAJO de 4.5:1:
      // el acento es una superficie, no texto, y llevarlo al contraste de
      // texto da los tonos chillones que este helper existe para evitar.
      expect(contraste).toBeGreaterThan(2.2)
      expect(contraste).toBeLessThan(4.5)
    }
  })

  it('es deterministico: mismo fondo, misma sugerencia', () => {
    expect(suggestAccent('#eef1f4')).toBe(suggestAccent('#eef1f4'))
  })
})
