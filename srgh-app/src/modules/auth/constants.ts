/**
 * Configuracion visual y textos de la pantalla de login.
 * Centralizado aqui para evitar valores quemados dentro de los componentes.
 * La pantalla usa la identidad del SISTEMA (SGRH), no de una empresa,
 * porque el acceso es multi-empresa.
 */
export const brandConfig = {
  systemName: 'SGRH',
  tagline: 'Talento, asistencia y planillas',
  logo: 'S',
  accent: 'bg-blue-700',
  accentHover: 'hover:bg-blue-800',
  gradient: 'from-slate-950 via-slate-900 to-slate-800',
} as const

export const loginScreenContent = {
  title: 'SGRH',
  subtitle: 'Gestion de talento, asistencia y planillas en un solo lugar.',
  features: [
    { key: 'expedientes', label: 'Expedientes' },
    { key: 'asistencia', label: 'Asistencia' },
    { key: 'planillas', label: 'Planillas' },
  ],
  copyrightName: 'SGRH Costa Rica',
} as const
