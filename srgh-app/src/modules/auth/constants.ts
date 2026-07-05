/**
 * Configuracion visual y textos de la pantalla de login.
 * Centralizado aqui para evitar valores quemados dentro de los componentes.
 * Si en el futuro esto se vuelve multi-empresa, esta config puede
 * cargarse desde Supabase (sgrh_empresas) en lugar de estar en codigo.
 */
export const companyConfig = {
  name: 'Celulares Alex',
  tagline: 'Talento, asistencia y planillas',
  logo: 'C',
  accent: 'bg-[#D97706]',
  accentHover: 'hover:bg-[#B45309]',
  gradient: 'from-[#1E3A8A] via-indigo-900 to-amber-950',
} as const

export const loginScreenContent = {
  badge: 'SGRH - Talento & Planillas',
  title: 'SGRH',
  description:
    'Sistema de Gestion de Recursos Humanos. Control de asistencia inteligente, calculo exacto de planillas Costarricenses (CCSS) y expedientes digitales.',
  quote:
    'La solucion de recursos humanos unificada para el retail de mayor movimiento tecnologico en el pais.',
  organization: 'Infinity CR & Celulares Alex',
  organizationDetail: 'Un solo ecosistema operativo',
  copyrightName: 'SGRH Hub Costa Rica',
  // TODO: mover esta imagen a /public para no depender de un servicio externo
  backgroundImageUrl:
    'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&q=80&w=800',
} as const
