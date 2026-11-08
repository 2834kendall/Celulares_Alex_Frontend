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

/**
 * El aguinaldo se nombra por el año en que se paga, como se dice en Costa
 * Rica: el "aguinaldo 2026" es el de diciembre de 2026 y cubre de diciembre de
 * 2025 a noviembre de 2026. Antes la pantalla decía "Ciclo 2025-2026" y los
 * avisos "aguinaldo 2025" o "ciclo 2025" para cosas distintas.
 */
export function nombreAguinaldo(anio: number): string {
  return `Aguinaldo ${anio}`
}

/** 'dic 2025 – nov 2026': lo que cubre el aguinaldo de `anio`. */
export function rangoAguinaldo(anio: number): string {
  return `dic ${anio - 1} – nov ${anio}`
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

/**
 * Un instante (ISO con zona) como fecha y hora de Costa Rica:
 * '2026-11-07T20:30:00Z' → '07/11/2026 14:30'. Con la zona explícita da lo
 * mismo en el servidor (UTC) y en el navegador.
 */
export function formatFechaHora(iso: string | null | undefined) {
  if (!iso) return '—'
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) return '—'
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00'
  return `${parte('day')}/${parte('month')}/${parte('year')} ${parte('hour')}:${parte('minute')}`
}

/** Monto en colones con separador de miles; '—' cuando no hay dato. */
export function formatCRC(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—'
  return `₡${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(amount)}`
}

/** Agrupa de 4 en 4 para lectura: 'CR05015202001026284066' → 'CR05 0152 0200 1026 2840 66'. */
/**
 * Horas para mostrar: "8" si es entero, "7.5" si no. Mismo criterio que
 * formatHoursValue en la pantalla de horarios — las horas trabajadas casi
 * siempre caen en enteros o medias horas, y "8.00" solo agrega ruido.
 */
export function formatHoras(horas: number | null | undefined) {
  const valor = horas ?? 0
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/0$/, '')
}

export function formatIban(numeroCuenta: string | null | undefined) {
  if (!numeroCuenta) return null
  return numeroCuenta.replace(/(.{4})/g, '$1 ').trim()
}
