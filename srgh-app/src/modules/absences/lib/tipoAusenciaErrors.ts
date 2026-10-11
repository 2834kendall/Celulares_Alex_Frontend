const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

// Códigos de los que depende otro módulo: no se pueden borrar.
export const CODIGOS_DEL_SISTEMA: Record<string, string> = {
  INC_ENF: 'La nómina usa este tipo para calcular el subsidio por enfermedad.',
}

export function tipoAusenciaDbError(
  error: { code?: string },
  codigo: string,
  accion: 'crear' | 'actualizar' | 'eliminar'
): string {
  if (error.code === UNIQUE_VIOLATION) {
    return `Ya existe un tipo con el código ${codigo}. Use un código distinto.`
  }

  if (error.code === FOREIGN_KEY_VIOLATION && accion === 'eliminar') {
    return 'No se puede eliminar: ya hay ausencias registradas con este tipo.'
  }

  return `No se pudo ${accion} el tipo de ausencia.`
}
