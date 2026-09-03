import type { BadgeTone } from '@/components/ui/Badge'

// Helpers de presentación del módulo Payroll (listado y detalle de periodos).

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  atrasado: 'Atrasado',
  pagado: 'Pagado',
}

/**
 * Tono del badge de estado; gris por defecto para estados desconocidos.
 *
 * Devuelve un `BadgeTone` y no un string de clases: la paleta vive una sola vez
 * en `components/ui/Badge`, aca solo se decide que estado va con que tono.
 */
const ESTADO_BADGE_TONES: Record<string, BadgeTone> = {
  borrador: 'amber',
  atrasado: 'rose',
  pagado: 'emerald',
}

export function estadoLabel(estado: string) {
  return ESTADO_LABELS[estado] ?? estado
}

/**
 * Estado que se le muestra al usuario. 'atrasado' no existe en la base: se
 * deriva de que el periodo ya terminó y todavía no está pagado (ver
 * lib/estadoPeriodo.ts). El estado guardado se deja intacto a propósito —
 * varias pantallas dependen de `estado === 'borrador'` para permitir editar,
 * y un periodo atrasado justamente hay que poder editarlo y pagarlo.
 */
export function estadoVisible(estado: string, atrasado: boolean): string {
  return atrasado ? 'atrasado' : estado
}

export function estadoBadgeTone(estado: string): BadgeTone {
  return ESTADO_BADGE_TONES[estado] ?? 'slate'
}

/** 'Enero 2026 · 1ª quincena' — encabezado legible del periodo. */
export function periodoLabel(mes: number, anio: number, quincena: number) {
  const nombreMes = MESES[mes - 1] ?? `Mes ${mes}`
  return `${nombreMes} ${anio} · ${quincena === 1 ? '1ª' : '2ª'} quincena`
}

/** '2024-02-01' → '01/02/2024' sin pasar por Date (evita el corrimiento UTC). */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** Monto en colones con separador de miles; '—' cuando no hay dato. */
export function formatCRC(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return `₡${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(amount)}`
}

/** Agrupa de 4 en 4 para lectura: 'CR05015202001026284066' → 'CR05 0152 0200 1026 2840 66'. */
export function formatIban(numeroCuenta: string | null | undefined) {
  if (!numeroCuenta) return null
  return numeroCuenta.replace(/(.{4})/g, '$1 ').trim()
}
