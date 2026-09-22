// Traducción de errores de Postgres a mensajes de UI del módulo Recruitment.
// Mismo patrón que modules/employees/lib/dbErrors.ts.

interface PostgresError {
  code?: string
  message?: string
  details?: string
}

const UNIQUE_VIOLATION = '23505'

/**
 * sgrh_candidatos tiene un UNIQUE compuesto (empresa + tipo + número de
 * identificación) — sgrh_cdt_identificacion_unica, agregado en SGRH-61 para
 * evitar registrar dos veces al mismo candidato. Devuelve null si el error
 * no es de unicidad.
 */
export function mapRecruitmentUniqueError(error: PostgresError | null | undefined): string | null {
  if (error?.code !== UNIQUE_VIOLATION) {
    return null
  }

  const context = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  if (context.includes('identificacion_unica')) {
    return 'Ya existe un candidato registrado con ese tipo y número de identificación.'
  }

  return 'Ya existe un candidato con alguno de los datos que deben ser únicos.'
}
