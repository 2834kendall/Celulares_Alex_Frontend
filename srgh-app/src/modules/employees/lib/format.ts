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
