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
  accent: 'bg-brand-700',
  accentHover: 'hover:bg-brand-800',
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

/**
 * Textos de <ExpiredLink/>, uno por flujo que llega por correo. El titulo es
 * el mismo —para quien lo lee el enlace simplemente no sirve— pero la salida
 * cambia: la invitacion solo la puede reenviar un administrador, mientras que
 * el enlace de recuperacion se lo puede pedir la persona sola.
 */
export const expiredLinkContent = {
  invite: {
    title: 'Enlace inválido o vencido',
    description:
      'El enlace de la invitación ya no es válido. Solicite a la persona administradora que le reenvíe la invitación desde la sección de usuarios.',
    ctaHref: '/login',
    ctaLabel: 'Ir a iniciar sesión',
  },
  recovery: {
    title: 'Enlace inválido o vencido',
    description:
      'El enlace para restablecer la contraseña ya venció o se usó antes. Solicite uno nuevo, llega a su correo en unos minutos.',
    ctaHref: '/forgot-password',
    ctaLabel: 'Solicitar un enlace nuevo',
  },
} as const
