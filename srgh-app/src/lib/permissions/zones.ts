import { PERMISOS, type Permiso } from '@/lib/permissions/catalog'

/**
 * Fuente unica de verdad de las ZONAS de la aplicacion:
 * que ruta existe, como se llama, y que permisos dan acceso a ella.
 * La usan el Sidebar (visibilidad), el Topbar (titulo de pagina)
 * y las pages (guard server-side con requirePermission/requireAnyPermission).
 */

// Conjuntos de acceso por zona (visible/accesible con AL MENOS UNO)
export const ACCESO_EMPLEADOS: Permiso[] = [PERMISOS.EMPLEADOS_READ]

export const ACCESO_ASISTENCIA: Permiso[] = [
  PERMISOS.ASISTENCIA_READ,
  PERMISOS.ASISTENCIA_WRITE,
  PERMISOS.AUSENCIAS_WRITE,
]

export const ACCESO_NOMINA: Permiso[] = [PERMISOS.NOMINA_READ, PERMISOS.COMPROBANTES_READ]

export const ACCESO_RECLUTAMIENTO: Permiso[] = [PERMISOS.RECLUTAMIENTO_READ]

export const ACCESO_EVALUACIONES: Permiso[] = [
  PERMISOS.EVALUACIONES_READ,
  PERMISOS.EVALUACIONES_WRITE,
]

export const ACCESO_CONFIGURACION: Permiso[] = [
  PERMISOS.EMPRESAS_WRITE,
  PERMISOS.CATALOGOS_WRITE,
  PERMISOS.ROLES_WRITE,
  PERMISOS.USUARIOS_WRITE,
]

export interface Zona {
  key: string
  href: string
  label: string
  /** Vacio = visible para cualquier usuario autenticado con permisos */
  permisos: Permiso[]
}

export const ZONAS: Zona[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Inicio', permisos: [] },
  { key: 'employees', href: '/employees', label: 'Empleados', permisos: ACCESO_EMPLEADOS },
  { key: 'attendance', href: '/attendance', label: 'Asistencia', permisos: ACCESO_ASISTENCIA },
  { key: 'payroll', href: '/payroll', label: 'Nomina', permisos: ACCESO_NOMINA },
  {
    key: 'recruitment',
    href: '/recruitment',
    label: 'Reclutamiento',
    permisos: ACCESO_RECLUTAMIENTO,
  },
  {
    key: 'evaluations',
    href: '/evaluations',
    label: 'Evaluaciones',
    permisos: ACCESO_EVALUACIONES,
  },
  { key: 'settings', href: '/settings', label: 'Configuracion', permisos: ACCESO_CONFIGURACION },
]

/** Zonas que el usuario puede ver segun los permisos de su JWT (solo UX). */
export function zonasVisibles(permisos: string[]): Zona[] {
  return ZONAS.filter(
    (zona) => zona.permisos.length === 0 || zona.permisos.some((p) => permisos.includes(p))
  )
}

/** Titulo de pagina para el Topbar segun la ruta actual. */
export function tituloDeRuta(pathname: string): string {
  const zona = ZONAS.find((z) => pathname === z.href || pathname.startsWith(`${z.href}/`))
  return zona?.label ?? 'SGRH'
}
