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

/** Luminancia relativa (0-1): >0.5 se trata como color "claro". */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
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
 * el que mas se acerca a un contraste moderado (~2.3, suficiente para
 * distinguirse sin chocar) en vez del que mas contraste da.
 */
export function suggestAccent(sidebarHex: string): string {
  const [sidebarHue] = hexToHsl(sidebarHex)
  const desplazamientos = [150, 180, 210, -150, -180, -210]
  const contrasteObjetivo = 2.3
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

export interface FrameTokens {
  '--color-frame-500': string
  '--color-frame-600': string
  '--color-frame-700': string
  '--color-frame-800': string
}

/**
 * Deriva SOLO los pasos que usa el "marco" de la app (item activo del menu,
 * insignias del logo, avatar del usuario, boton primario — ver
 * `--color-frame-*` en globals.css): nunca los badges/tabs/inputs del
 * contenido de los modulos, que quedan fijos en `--color-brand-*` sin
 * importar la sucursal.
 */
export function deriveFrameTokens(hex: string): FrameTokens {
  return {
    '--color-frame-500': lighten(hex, 0.12),
    '--color-frame-600': hex,
    '--color-frame-700': darken(hex, 0.15),
    '--color-frame-800': darken(hex, 0.3),
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
 * Borde y texto legibles a partir de un unico color de fondo — si es claro
 * el texto se oscurece, si es oscuro se aclara, para no tener que elegir
 * "modo" a mano.
 */
export function deriveSidebarTokens(hex: string): SidebarTokens {
  const esClaro = relativeLuminance(hex) > 0.5
  return {
    '--sidebar-bg': hex,
    '--sidebar-border': esClaro ? darken(hex, 0.12) : lighten(hex, 0.18),
    '--sidebar-text': esClaro ? darken(hex, 0.55) : lighten(hex, 0.65),
    '--sidebar-text-strong': esClaro ? darken(hex, 0.85) : lighten(hex, 0.94),
  }
}
