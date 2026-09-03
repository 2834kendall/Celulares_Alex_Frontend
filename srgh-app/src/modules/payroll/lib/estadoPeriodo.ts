import { hoyLocal } from '@/modules/payroll/lib/fechas'

/**
 * Un periodo de planilla solo tiene dos estados guardados: 'borrador' y
 * 'pagado', y la aplicación los recalcula sola (ver sincronizarEstadoPeriodo
 * en marcarDetallePagado.ts). No existe ningún estado que diga "esto ya
 * vencío y todavía se le debe a alguien": un periodo impago se quedaba en
 * 'borrador' indefinidamente, indistinguible de uno que apenas se abrió.
 *
 * "Atrasado" no se guarda: se deriva. La fecha de corte es el fin del periodo
 * trabajado (npe_fecha_fin_periodo), que es la fecha a partir de la cual el
 * pago corresponde. Un periodo que termina hoy todavía no está atrasado.
 *
 * Es un estado VISUAL: no bloquea nada. Un periodo atrasado se sigue pudiendo
 * editar y pagar — es justamente lo que hay que hacer con él.
 */
export function periodoAtrasado(
  estado: string,
  fechaFinPeriodo: string | null,
  hoy: string = hoyLocal()
): boolean {
  if (estado === 'pagado') return false
  if (!fechaFinPeriodo) return false
  // Fechas 'YYYY-MM-DD': el orden lexicográfico es el orden cronológico.
  return fechaFinPeriodo < hoy
}
