/** Codigo de Postgres para una violacion de restriccion unica. */
const UNIQUE_VIOLATION = '23505'

/**
 * Traduce el error de la base al guardar un tipo de tardia. El unico caso que
 * vale la pena explicar es el de dos tipos empezando en el mismo minuto
 * (sgrh_cat_tta_empresa_desde_unique): es el que el administrador puede
 * provocar desde el formulario y arreglar cambiando un numero.
 */
export function tipoTardiaDbError(
  error: { code?: string },
  desdeMinutos: number,
  accion: 'crear' | 'actualizar'
): string {
  if (error.code === UNIQUE_VIOLATION) {
    return `Ya hay un tipo de tardia que empieza en el minuto ${desdeMinutos}. Cada tipo tiene que empezar en un minuto distinto.`
  }

  return `No se pudo ${accion} el tipo de tardia.`
}
