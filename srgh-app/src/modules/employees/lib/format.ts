// Helpers de presentación del módulo Employees (lista, detalle y formularios).

// Valores alineados al CHECK de la DB: emp_genero IN ('M','F','O').
export const GENERO_LABELS: Record<string, string> = {
  M: 'Masculino',
  F: 'Femenino',
  O: 'Otro',
}

export const TIPO_CUENTA_LABELS: Record<string, string> = {
  CORRIENTE: 'Corriente',
  AHORRO: 'Ahorro',
  SINPE: 'SINPE Móvil',
}

/** '2024-02-01' → '01/02/2024' sin pasar por Date (evita el corrimiento UTC). */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * '1990-05-10' → '10 de mayo'. Omite el año a proposito: al lado de "Fecha de
 * nacimiento", que ya lo muestra completo, lo que aporta este campo es CUANDO
 * se celebra. Sin pasar por Date (mismo criterio que formatDate).
 */
export function formatCumpleanos(iso: string | null | undefined) {
  if (!iso) return '—'
  const [, month, day] = iso.split('-')
  const nombreMes = MESES[Number(month) - 1]
  if (!nombreMes || !day) return formatDate(iso)
  return `${Number(day)} de ${nombreMes}`
}

/**
 * true si hoy es el cumpleaños: compara dia y mes ignorando el año. Lee el
 * reloj LOCAL, asi que el llamador debe resolverlo ya montado en el navegador
 * y no durante el render del servidor (ver EmployeeDetail).
 */
export function esCumpleanosHoy(iso: string | null | undefined) {
  if (!iso) return false
  const [, month, day] = iso.split('-')
  const hoy = new Date()
  return Number(month) === hoy.getMonth() + 1 && Number(day) === hoy.getDate()
}

/**
 * Monto en colones: sin decimales cuando es entero (`₡500 000`) y con 2
 * decimales cuando trae céntimos (`₡1 234,50`); `'—'` cuando no hay dato.
 */
export function formatCRC(amount: number | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—'
  const fractionDigits = Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

/**
 * Formatea un monto numérico para mostrarlo en un `<input>` de moneda (sin `₡`,
 * que ya vive en el label). Si trae más de 2 decimales conserva hasta 6 para no
 * ocultar el dígito que dispara el error de validación.
 */
export function formatCurrencyInput(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const isInt = Number.isInteger(amount)
  const minDigits = isInt ? 0 : 2
  const maxDigits = isInt ? 0 : Number(amount.toFixed(2)) === amount ? 2 : 6
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(amount)
}

/**
 * Convierte lo que la persona escribe o pega en un campo de salario a `number`.
 *
 * - Conserva el signo `-` inicial para que Zod rechace negativos con su mensaje
 *   explícito en vez de convertir `-500` en `500`.
 * - Si aparecen `.` y `,` a la vez (`1,234.56` o `1.234,56`), el último actúa
 *   como separador decimal y el otro como separador de miles.
 * - Si aparece un único `.` o una única `,` (incluso con 3 dígitos detrás, como
 *   `350000.555`), se trata SIEMPRE como separador decimal.
 * - Solo cuando el mismo separador se repite 2 o más veces en grupos de miles
 *   (`1.500.000` o `1,500,000`) se interpreta como separador de miles.
 */
export function parseCurrencyInput(raw: string): number {
  const cleaned = raw.replace(/[\s\u00a0₡]+/g, '')
  if (cleaned === '' || cleaned === '-') return NaN

  const isNegative = cleaned.startsWith('-')
  const unsigned = isNegative ? cleaned.slice(1) : cleaned
  if (unsigned === '' || !/^[0-9.,]+$/.test(unsigned)) return NaN

  const dots = (unsigned.match(/\./g) ?? []).length
  const commas = (unsigned.match(/,/g) ?? []).length

  let normalized: string
  if (dots > 0 && commas > 0) {
    const lastDot = unsigned.lastIndexOf('.')
    const lastComma = unsigned.lastIndexOf(',')
    if (lastDot > lastComma) {
      if (dots > 1) return NaN
      normalized = unsigned.replace(/,/g, '')
    } else {
      if (commas > 1) return NaN
      normalized = unsigned.replace(/\./g, '').replace(',', '.')
    }
  } else if (dots + commas === 1) {
    normalized = unsigned.replace(',', '.')
    if (normalized === '.') return NaN
  } else if (dots >= 2) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(unsigned)) return NaN
    normalized = unsigned.replace(/\./g, '')
  } else if (commas >= 2) {
    if (!/^\d{1,3}(,\d{3})+$/.test(unsigned)) return NaN
    normalized = unsigned.replace(/,/g, '')
  } else {
    normalized = unsigned
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return NaN
  if (parsed === 0) return 0
  return isNegative ? -parsed : parsed
}

export function fullName(persona: {
  emp_nombre: string
  emp_apellido_1: string
  emp_apellido_2: string | null
}) {
  return `${persona.emp_nombre} ${persona.emp_apellido_1}${
    persona.emp_apellido_2 ? ' ' + persona.emp_apellido_2 : ''
  }`
}

/**
 * Nombre de archivo sin su extensión — es el valor por defecto del campo
 * "nombre" al capturar la metadata de un documento, tanto en el wizard como
 * en el perfil.
 */
export function nombreSinExtension(fileName: string) {
  const withoutExt = fileName.replace(/\.[^./]+$/, '')
  return withoutExt || fileName
}

/**
 * true si `fecha` (YYYY-MM-DD) ya pasó respecto a hoy. Comparación de strings
 * en vez de Date: evita el corrimiento UTC (mismo criterio que formatDate).
 */
export function esFechaVencida(fecha: string | null | undefined) {
  if (!fecha) return false
  const hoy = new Date()
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(
    hoy.getDate()
  ).padStart(2, '0')}`
  return fecha < hoyIso
}
