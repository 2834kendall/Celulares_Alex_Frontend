/**
 * Identidad de marca mostrada en el shell de la aplicacion.
 * El nombre real de la empresa se carga desde sgrh_empresas via
 * getEmpresaNombre() (lib/empresa); `empresa` queda solo como
 * fallback cuando la consulta falla o no hay fila visible por RLS.
 */
export const BRAND = {
  empresa: 'Celulares Alex',
  sistema: 'SGRH',
  tagline: 'Talento, asistencia y planillas',
} as const
