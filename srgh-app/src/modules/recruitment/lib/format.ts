// Helpers de presentación del módulo Recruitment.

/** Etiquetas legibles para sgrh_candidato_documentos.cdo_tipo. */
export const TIPO_DOCUMENTO_LABELS: Record<string, string> = {
  CV: 'Currículum',
  CEDULA: 'Cédula',
  REFERENCIA: 'Carta de referencia',
  TITULO: 'Título/certificado',
  OTRO: 'Otro',
}

export function fullName(candidato: {
  cdt_nombre: string
  cdt_apellido_1: string
  cdt_apellido_2: string | null
}) {
  return `${candidato.cdt_nombre} ${candidato.cdt_apellido_1}${
    candidato.cdt_apellido_2 ? ' ' + candidato.cdt_apellido_2 : ''
  }`
}

/** Etiquetas legibles para sgrh_postulaciones.pos_estado_final. */
export const ESTADO_POSTULACION_LABELS: Record<string, string> = {
  en_proceso: 'En proceso',
  contratado: 'Contratado',
  descartado: 'Descartado',
}

/** Etiquetas legibles para pet_resultado (ver CHECK en la migración SGRH-61). */
export const RESULTADO_ETAPA_LABELS: Record<string, string> = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pendiente: 'Pendiente',
}
