import { round2 } from '@/modules/payroll/lib/numeros'

/**
 * Cálculo de incapacidad por enfermedad (INC_ENF), según las reglas
 * confirmadas para este sistema:
 *  - El patrono paga los primeros 3 días de cada incapacidad, al 50% del
 *    salario. Desde el día 4 en adelante paga la CCSS (no pasa por nuestra
 *    planilla, es informativo).
 *  - Ese tope de 3 días es POR MES CALENDARIO, no por incapacidad: si un
 *    empleado tiene dos incapacidades cortas en el mismo mes, el patrono no
 *    paga más de 3 días combinados entre las dos.
 *  - Los días de incapacidad no afectan vacaciones (tau_descuenta_vacaciones
 *    = false en el catálogo) ni se sospechan cesantía/aguinaldo/liquidación,
 *    porque su monto nunca se suma a ndt_salario_bruto: se muestra como una
 *    línea aparte, después del salario neto.
 */

const MS_POR_DIA = 1000 * 60 * 60 * 24

/** 'YYYY-MM-DD' → Date en horario local (evita el corrimiento UTC de `new Date(str)`). */
/**
 * Días (inclusive en ambos extremos) en que dos rangos de fechas se
 * traslapan. 0 si no se tocan.
 */
export function diasSuperpuestos(inicioA: Date, finA: Date, inicioB: Date, finB: Date): number {
  const inicio = inicioA > inicioB ? inicioA : inicioB
  const fin = finA < finB ? finA : finB
  const dias = Math.round((fin.getTime() - inicio.getTime()) / MS_POR_DIA) + 1
  return Math.max(0, dias)
}

export interface RepartoIncapacidad {
  diasEmpleador: number
  diasCcss: number
}

/**
 * Del total de días de incapacidad que caen dentro de un periodo, cuántos
 * sigue pudiendo pagar el patrono (tope mensual) y cuántos ya le tocan a la
 * CCSS. `diasEmpleadorUsadosEsteMes` es lo que ya se le pagó al empleado en
 * OTROS periodos del mismo mes calendario, antes de este periodo.
 */
export function repartirDiasIncapacidad(
  diasEnPeriodo: number,
  diasEmpleadorUsadosEsteMes: number,
  topeMensualEmpleador = 3
): RepartoIncapacidad {
  const disponibles = Math.max(0, topeMensualEmpleador - diasEmpleadorUsadosEsteMes)
  const diasEmpleador = Math.min(diasEnPeriodo, disponibles)
  const diasCcss = diasEnPeriodo - diasEmpleador
  return { diasEmpleador, diasCcss }
}

/** días del patrono × salario diario × % que paga el patrono (ej. 50). */
export function calcularMontoIncapacidad(
  diasEmpleador: number,
  salarioDiario: number,
  porcentajePagoEmpleador: number
): number {
  return round2(diasEmpleador * salarioDiario * (porcentajePagoEmpleador / 100))
}

/**
 * Salario mensual sobre el que se paga la incapacidad: el REAL del contrato,
 * igual que el resto del módulo (horas extra, ajuste, vacaciones). Antes se
 * usaba el salario base y quien gana más que el base cobraba la incapacidad
 * de menos (auditoría 2, hallazgo 15). Sin salario real, el base.
 */
export function salarioMensualIncapacidad(contrato: {
  salarioBaseMensual: number
  salarioRealMensual: number | null
}): number {
  const real = Number(contrato.salarioRealMensual ?? 0)
  return Number.isFinite(real) && real > 0 ? real : Number(contrato.salarioBaseMensual ?? 0)
}

/**
 * Monto de incapacidad de una fila de planilla, con el salario y el porcentaje
 * de hoy: salario REAL mensual ÷ 30 por día (ver salarioMensualIncapacidad).
 * Es la cuenta que muestra una fila sin pagar; al marcar el pago se congela en
 * ndt_monto_incapacidad. Sigue fuera del salario bruto y del aguinaldo, y el
 * patrono sigue pagando solo los 3 primeros días del mes.
 */
export function montoIncapacidadEnVivo(
  diasEmpleador: number,
  contrato: { salarioBaseMensual: number; salarioRealMensual: number | null },
  porcentajePagoEmpleador: number
): number {
  return calcularMontoIncapacidad(
    diasEmpleador,
    salarioMensualIncapacidad(contrato) / 30,
    porcentajePagoEmpleador
  )
}
