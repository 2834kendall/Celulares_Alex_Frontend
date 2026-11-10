/**
 * Límites de la anulación de pagos de aguinaldo y liquidación. Son los mismos
 * que revisa la base (org_horas_anular_pago y anular_pago_extraordinario, ver
 * la migración 20261107130000); acá están para que la pantalla avise antes.
 * Sin 'server-only': los usan también los formularios.
 */

/** Plazo por defecto, el mismo DEFAULT de org_horas_anular_pago. */
export const HORAS_ANULAR_PAGO_DEFAULT = 48
export const HORAS_ANULAR_PAGO_MIN = 1
export const HORAS_ANULAR_PAGO_MAX = 720
export const LARGO_MINIMO_MOTIVO = 5
export const LARGO_MAXIMO_MOTIVO = 500
