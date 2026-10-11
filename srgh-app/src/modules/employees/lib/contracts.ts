import type { ContratoDetalle } from '@/modules/employees/types'

export interface ContractSummary {
  vigente: ContratoDetalle | null
  cerrados: ContratoDetalle[]
  /** El más reciente (contratos llega ordenado del más nuevo al más viejo). */
  ultimo: ContratoDetalle | null
  /** Último día de una terminación registrada que todavía no llegó (preaviso). */
  programada: string | null
  /** Sin vigente y el último contrato terminado sin liquidación. */
  pendienteDeLiquidar: boolean
  /** Lo que "Revertir terminación" deshace: la programada o la cerrada sin liquidar. */
  revertible: ContratoDetalle | null
}

/**
 * Estado del tab Contrato (SGRH-90), compartido por la sección de lectura y
 * los botones de acción del encabezado para que no lo calculen cada uno a su
 * manera. Las reglas de verdad las aplican las RPC; esto solo decide qué se
 * muestra.
 */
export function summarizeContracts(contratos: ContratoDetalle[]): ContractSummary {
  const vigente = contratos.find((c) => c.lab_fecha_fin === null) ?? null
  const ultimo = contratos[0] ?? null
  const programada = vigente?.lab_fecha_fin_programada ?? null
  const pendienteDeLiquidar =
    !vigente && ultimo !== null && ultimo.lab_fecha_fin !== null && !ultimo.liquidado

  return {
    vigente,
    cerrados: contratos.filter((c) => c.lab_fecha_fin !== null),
    ultimo,
    programada,
    pendienteDeLiquidar,
    revertible: programada ? vigente : pendienteDeLiquidar ? ultimo : null,
  }
}
