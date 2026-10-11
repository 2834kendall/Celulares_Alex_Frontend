/**
 * ¿Esta fila de planilla no tiene nada que pagar?
 *
 * Salario ₡0, sin horas trabajadas ni extra, y sin días de incapacidad a cargo
 * del patrono. Es lo que queda cuando "Cargar empleados" trae a alguien sin
 * horario ni marcas en la quincena. Esa fila no se puede marcar pagada (no hay
 * nada que pagar) y, si el periodo ya venció, tampoco se podía quitar por
 * Excel: el periodo quedaba en borrador para siempre (auditoría 2, fallo 5).
 *
 * Una fila con horas pero en ₡0 NO entra: ahí falta el salario, se le debe
 * algo y hay que recalcularla, no sacarla.
 */
export function filaSinNadaQuePagar(fila: {
  ndt_pagado: boolean
  ndt_salario_bruto: number | null
  ndt_salario_neto?: number | null
  ndt_horas_ordinarias_diurnas: number | null
  ndt_horas_extra_al_50: number | null
  ndt_dias_incapacidad_empleador?: number | null
}): boolean {
  return (
    !fila.ndt_pagado &&
    !(Number(fila.ndt_salario_bruto ?? 0) > 0) &&
    !(Number(fila.ndt_salario_neto ?? 0) > 0) &&
    !(Number(fila.ndt_horas_ordinarias_diurnas ?? 0) > 0) &&
    !(Number(fila.ndt_horas_extra_al_50 ?? 0) > 0) &&
    !(Number(fila.ndt_dias_incapacidad_empleador ?? 0) > 0)
  )
}
