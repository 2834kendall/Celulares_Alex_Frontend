export function absencePaidFraction(type: {
  tau_requiere_documento_ccss: boolean
  tau_porcentaje_pago_empleador: number | null
}): number {
  if (type.tau_requiere_documento_ccss) return 0

  const percentage = Number(type.tau_porcentaje_pago_empleador ?? 0)
  if (!Number.isFinite(percentage) || percentage <= 0) return 0

  return Math.min(percentage, 100) / 100
}
