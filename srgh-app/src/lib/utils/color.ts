/**
 * Deriva paletas completas (escala de acento, superficie de sidebar) a
 * partir de un unico color hex elegido por sucursal. Un solo lugar de
 * verdad: lo usa tanto `AppShell` (para pintar el shell real con el color
 * guardado) como el formulario de apariencia (para la vista previa en vivo
 * mientras se elige un color, antes de guardar) — mismos numeros, cero
 * deriva entre lo que se ve al elegir y lo que se ve despues de guardar.
 */

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c)))
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`
}

/** Oscurece hacia negro. `amount` entre 0 (sin cambio) y 1 (negro). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)])
}

/** Aclara hacia blanco. `amount` entre 0 (sin cambio) y 1 (blanco). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount])
}

/**
 * Luminancia relativa segun WCAG 2.x (0 = negro, 1 = blanco).
 *
 * El paso clave es LINEALIZAR cada canal sRGB antes de ponderarlo: los
 * valores de un hex vienen con correccion gamma aplicada, y ponderarlos tal
 * cual da un numero que no corresponde a la luz que realmente emite la
 * pantalla. Esta funcion hacia justo eso —promediar los canales crudos— y el
 * resultado subestimaba el contraste entre un 80% y un 195%: por ejemplo el
 * texto base de la app sobre su fondo daba 7.4:1 cuando en realidad es
 * 17.5:1. Cualquiera que la usara para auditar accesibilidad veia fallas
 * inexistentes.
 *
 * OJO: NO sirve para preguntarse "este color es claro u oscuro?" con un
 * umbral de 0.5. La curva gamma hunde los tonos medios (un gris #969696 da
 * 0.32, o sea "oscuro"), pero sobre ese gris el texto legible es el OSCURO,
 * no el claro. Para esa decision hay que comparar contrastes, que es lo que
 * hace `deriveSidebarTokens`.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((canal) => {
    const s = canal / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ratio de contraste WCAG entre dos colores (1 = igual, 21 = maximo). */
export function contrastRatio(hexA: string, hexB: string): number {
  const [claro, oscuro] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a)
  return (claro + 0.05) / (oscuro + 0.05)
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return [0, 0, l * 100]

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  switch (max) {
    case r:
      h = ((g - b) / d) % 6
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
  }
  h *= 60
  if (h < 0) h += 360

  return [h, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2

  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255])
}

/**
 * Sugiere un color de acento que se distinga del fondo elegido para la
 * barra lateral — ahi es donde el acento tiene que notarse (item activo del
 * menu, ver `NavLinks`) — pero sin llegar a un contraste maximo, que en la
 * practica da tonos chillones o mal combinados (ej. verde oliva sobre azul
 * marino). Prueba varios matices desplazados del de la barra, con
 * saturacion/luminosidad bajas ("empresarial", nunca neon), y se queda con
 * el que mas se acerca a un contraste moderado (~3, suficiente para
 * distinguirse sin chocar) en vez del que mas contraste da.
 *
 * El objetivo era 2.3 cuando `contrastRatio` devolvia numeros subestimados;
 * al corregir la formula a WCAG se recalibro a 3.05, que es el valor que
 * reproduce las mismas sugerencias que se venian dando (7 de 9 colores de
 * prueba, incluidos los 6 presets ofrecidos, dan identico).
 */
export function suggestAccent(sidebarHex: string): string {
  const [sidebarHue] = hexToHsl(sidebarHex)
  const desplazamientos = [150, 180, 210, -150, -180, -210]
  const contrasteObjetivo = 3.05
  const saturacion = 38
  const luminosidad = 46

  let mejor = hslToHex((sidebarHue + desplazamientos[0] + 360) % 360, saturacion, luminosidad)
  let mejorDiferencia = Math.abs(contrastRatio(mejor, sidebarHex) - contrasteObjetivo)

  for (const delta of desplazamientos.slice(1)) {
    const candidato = hslToHex((sidebarHue + delta + 360) % 360, saturacion, luminosidad)
    const diferencia = Math.abs(contrastRatio(candidato, sidebarHex) - contrasteObjetivo)
    if (diferencia < mejorDiferencia) {
      mejorDiferencia = diferencia
      mejor = candidato
    }
  }

  return mejor
}

export interface BrandTokens {
  '--color-brand-50': string
  '--color-brand-100': string
  '--color-brand-200': string
  '--color-brand-300': string
  '--color-brand-400': string
  '--color-brand-500': string
  '--color-brand-600': string
  '--color-brand-700': string
  '--color-brand-800': string
}

/**
 * Deriva la escala de marca COMPLETA a partir del color de acento de la
 * sucursal. Es la unica escala de acento de la app (ver `--color-brand-*` en
 * globals.css): la pintan por igual el marco (item activo del menu, logo,
 * avatar, boton primario) y el contenido de los modulos (tabs, badges,
 * focus rings, inputs).
 *
 * Antes existia una segunda escala `--color-frame-*` para el marco, y
 * `brand` quedaba clavado en cyan para el contenido. El resultado era que
 * una misma pantalla mezclaba dos acentos —el boton primario tomaba el color
 * de la sucursal y el de al lado seguia cyan— y 170 de 189 usos ignoraban la
 * plantilla elegida. Una sola escala elimina esa clase de bug de raiz: no hay
 * forma de "olvidarse" de aplicar el tema.
 *
 * Los pasos 500-800 conservan exactamente los valores de la escala `frame`
 * anterior, para que el marco no cambie de tono con la unificacion; los pasos
 * claros (50-400) se agregan para los fondos suaves, bordes y anillos de foco
 * que el contenido ya usaba.
 *
 * Los colores SEMANTICOS (emerald/amber/rose para presente/tarde/ausente) no
 * salen de aca a proposito: comunican estado, no marca, y tienen que
 * significar lo mismo en todas las sucursales.
 */
export function deriveBrandTokens(hex: string): BrandTokens {
  return {
    '--color-brand-50': lighten(hex, 0.95),
    '--color-brand-100': lighten(hex, 0.88),
    '--color-brand-200': lighten(hex, 0.75),
    '--color-brand-300': lighten(hex, 0.55),
    '--color-brand-400': lighten(hex, 0.3),
    '--color-brand-500': lighten(hex, 0.12),
    '--color-brand-600': hex,
    '--color-brand-700': darken(hex, 0.15),
    '--color-brand-800': darken(hex, 0.3),
  }
}

/**
 * Fondo de las paginas de contenido: una version aclarada (85% hacia
 * blanco) del color de la barra lateral — se nota lo suficiente para "ir
 * con" el marco, sin competir con las tarjetas blancas de verdad ni con el
 * texto. Nunca es un color elegible aparte: siempre se deriva del mismo
 * color de la barra.
 */
export function derivePageBackground(hex: string): string {
  return lighten(hex, 0.85)
}

export interface SidebarTokens {
  '--sidebar-bg': string
  '--sidebar-border': string
  '--sidebar-text': string
  '--sidebar-text-strong': string
}

/**
 * Borde y texto legibles a partir de un unico color de fondo, sin tener que
 * elegir "modo claro/oscuro" a mano.
 *
 * La direccion del texto (oscurecer o aclarar respecto del fondo) se decide
 * MIDIENDO cual de las dos opciones contrasta mas, no con un umbral de
 * luminancia. Antes era `relativeLuminance(hex) > 0.5`, que con la formula
 * WCAG correcta se equivoca justo en los tonos medios: un gris #7a7a7a queda
 * por debajo de 0.5 —"oscuro"— y por lo tanto recibia texto claro, cuando
 * sobre ese gris el texto oscuro contrasta bastante mejor (4.4:1 contra
 * 3.0:1). Comparar las dos candidatas reales elimina el umbral magico y de
 * paso siempre elige la mas legible.
 */
export function deriveSidebarTokens(hex: string): SidebarTokens {
  const textoOscuro = darken(hex, 0.85)
  const textoClaro = lighten(hex, 0.94)
  const esClaro = contrastRatio(textoOscuro, hex) >= contrastRatio(textoClaro, hex)
  return {
    '--sidebar-bg': hex,
    '--sidebar-border': esClaro ? darken(hex, 0.12) : lighten(hex, 0.18),
    '--sidebar-text': esClaro ? darken(hex, 0.55) : lighten(hex, 0.65),
    '--sidebar-text-strong': esClaro ? darken(hex, 0.85) : lighten(hex, 0.94),
  }
}
