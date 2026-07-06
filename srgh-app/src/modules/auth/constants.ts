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
  accent: 'bg-gradient-to-r from-[#D97706] to-[#F59E0B]',
  accentHover: 'hover:from-[#B45309] hover:to-[#D97706]',
  accentSolid: 'bg-[#D97706]',
  gradient: 'from-[#1E3A8A] via-[#1E1B4B] to-[#0F172A]',
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
