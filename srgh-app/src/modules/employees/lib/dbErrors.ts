// Traducción de errores de Postgres a mensajes de UI del módulo Employees.

interface PostgresError {
  code?: string
  message?: string
  details?: string
}

const UNIQUE_VIOLATION = '23505'

/**
 * sgrh_empleados tiene varias columnas únicas (identificación, correo personal,
 * nº de asegurado CCSS). Postgres reporta todas con el código 23505, pero el
 * nombre de la columna violada viene en message/details — de ahí sale el
 * mensaje específico. Devuelve null si el error no es de unicidad.
 */
export function mapEmployeeUniqueError(error: PostgresError | null | undefined): string | null {
  if (error?.code !== UNIQUE_VIOLATION) {
    return null
  }

  const context = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  if (context.includes('identificacion')) {
    return 'Ya existe un empleado con ese número de identificación.'
  }
  if (context.includes('email')) {
    return 'Ya existe un empleado con ese correo personal.'
  }
  if (context.includes('ccss')) {
    return 'Ya existe un empleado con ese número de asegurado CCSS.'
  }

  return 'Ya existe un empleado con alguno de los datos que deben ser únicos (identificación, correo personal o nº de asegurado CCSS).'
}

/**
 * Errores de las RPC de contratos (crear_contrato, editar_contrato,
 * terminar_contrato, revertir_terminacion). Sus RAISE EXCEPTION ya vienen
 * escritos para la UI, así que se muestran tal cual. El 23505 no: lo levanta
 * el índice ux_historial_un_contrato_vigente cuando dos personas guardan a la
 * vez, y su mensaje nombra el índice.
 */
export function mapContractError(
  error: PostgresError | null | undefined,
  generico: string
): string {
  switch (error?.code) {
    case UNIQUE_VIOLATION:
      return 'Este empleado ya tiene un contrato vigente.'
    case '23514':
    case '23503':
    case '42501':
      return error.message || generico
    default:
      return generico
  }
}
