import { PERMISOS, type Permiso } from '@/lib/permissions/catalog'

/**
 * Fuente unica de verdad de las ZONAS de la aplicacion:
 * que ruta existe, como se llama, en que grupo del menu va y que permisos dan
 * acceso a ella. La usan el menu lateral (visibilidad y agrupacion) y las
 * pages (guard server-side con requirePermission/requireAnyPermission).
 */

// Conjuntos de acceso por zona (visible/accesible con AL MENOS UNO)
export const ACCESO_EMPLEADOS: Permiso[] = [PERMISOS.EMPLEADOS_READ]

export const ACCESO_ASISTENCIA: Permiso[] = [
  PERMISOS.ASISTENCIA_READ,
  PERMISOS.ASISTENCIA_WRITE,
  PERMISOS.AUSENCIAS_WRITE,
]
export const ACCESO_HORARIOS: Permiso[] = [PERMISOS.HORARIOS_READ, PERMISOS.HORARIOS_WRITE]

export const ACCESO_MI_HORARIO: Permiso[] = [PERMISOS.MI_HORARIO_READ]

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

/** Grupos rotulados del menu principal. El orden de este arreglo es el del menu. */
export type ZoneGroupId = 'people' | 'operations' | 'administration'

export interface ZoneGroup {
  id: ZoneGroupId
  label: string
}

export const ZONE_GROUPS: readonly ZoneGroup[] = [
  { id: 'people', label: 'Personal' },
  { id: 'operations', label: 'Operación' },
  { id: 'administration', label: 'Administración' },
]

export interface Zona {
  key: string
  href: string
  label: string
  /** Vacio = visible para cualquier usuario autenticado con permisos */
  permisos: Permiso[]
  /** null = sin grupo, arriba de todo (solo Inicio). */
  group: ZoneGroupId | null
}

/**
 * En el orden del menu: cada grupo junto, en el orden de `ZONE_GROUPS`. Un
 * test compara este arreglo contra lo que arma `visibleNavSections`, asi que
 * una zona fuera de lugar se detecta ahi y no en pantalla.
 */
export const ZONAS: Zona[] = [
  { key: 'dashboard', href: '/dashboard', label: 'Inicio', permisos: [], group: null },
  {
    key: 'employees',
    href: '/employees',
    label: 'Empleados',
    permisos: ACCESO_EMPLEADOS,
    group: 'people',
  },
  {
    key: 'recruitment',
    href: '/recruitment',
    label: 'Reclutamiento',
    permisos: ACCESO_RECLUTAMIENTO,
    group: 'people',
  },
  {
    key: 'evaluations',
    href: '/evaluations',
    label: 'Evaluaciones',
    permisos: ACCESO_EVALUACIONES,
    group: 'people',
  },
  {
    key: 'attendance',
    href: '/attendance',
    label: 'Asistencia',
    permisos: ACCESO_ASISTENCIA,
    group: 'operations',
  },
  {
    key: 'schedule',
    href: '/schedule',
    label: 'Horarios',
    permisos: ACCESO_HORARIOS,
    group: 'operations',
  },
  {
    key: 'my-schedule',
    href: '/my-schedule',
    label: 'Mi horario',
    permisos: ACCESO_MI_HORARIO,
    group: 'operations',
  },
  {
    key: 'payroll',
    href: '/payroll',
    label: 'Nómina',
    permisos: ACCESO_NOMINA,
    group: 'administration',
  },
  {
    key: 'settings',
    href: '/settings',
    label: 'Configuración',
    permisos: ACCESO_CONFIGURACION,
    group: 'administration',
  },
]

/** Zonas que el usuario puede ver segun los permisos de su JWT (solo UX). */
export function zonasVisibles(permisos: string[]): Zona[] {
  return ZONAS.filter(
    (zona) => zona.permisos.length === 0 || zona.permisos.some((p) => permisos.includes(p))
  )
}

/** Un tramo del menu: las zonas sin grupo, o las de un grupo con su rotulo. */
export interface NavSection {
  group: ZoneGroup | null
  zonas: Zona[]
}

/**
 * Zonas visibles agrupadas para el menu. Los grupos sin ninguna zona visible
 * no aparecen, para no dejar un rotulo sin items debajo.
 *
 * La seccion sin grupo va siempre: Inicio no pide permisos, asi que nunca
 * queda vacia (un test lo fija).
 */
export function visibleNavSections(permisos: string[]): NavSection[] {
  const visibles = zonasVisibles(permisos)
  const sections: NavSection[] = [
    { group: null, zonas: visibles.filter((zona) => zona.group === null) },
  ]
  for (const group of ZONE_GROUPS) {
    const zonas = visibles.filter((zona) => zona.group === group.id)
    if (zonas.length > 0) {
      sections.push({ group, zonas })
    }
  }
  return sections
}
