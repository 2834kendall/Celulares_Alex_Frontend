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

/** Monto en colones sin decimales; '—' cuando no hay dato. */
export function formatCRC(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 0,
  }).format(amount)
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
