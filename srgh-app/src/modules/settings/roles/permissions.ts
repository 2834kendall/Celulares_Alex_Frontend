import { PERMISOS, type Permiso } from '@/lib/permissions/catalog'

/**
 * Cómo se muestran los permisos en el editor de roles: agrupados por módulo y
 * con nombre en lenguaje llano, nunca el código.
 *
 * `ASISTENCIA_KIOSCO` no aparece a propósito: es el permiso de la cuenta de
 * la tablet (rol KIOSCO) y la RPC rechaza ponérselo a cualquier otro rol.
 */
export interface PermissionItem {
  code: Permiso
  label: string
}

export type PermissionGroupIcon =
  'users' | 'file' | 'clock' | 'calendar' | 'schedule' | 'money' | 'check' | 'settings'

export interface PermissionGroup {
  id: string
  label: string
  icon: PermissionGroupIcon
  items: PermissionItem[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'empleados',
    label: 'Empleados',
    icon: 'users',
    items: [
      { code: PERMISOS.EMPLEADOS_READ, label: 'Ver empleados' },
      { code: PERMISOS.EMPLEADOS_WRITE, label: 'Editar empleados' },
      { code: PERMISOS.FOTOS_READ, label: 'Ver fotos de empleados' },
      { code: PERMISOS.DOCUMENTOS_READ, label: 'Ver documentos del expediente' },
      { code: PERMISOS.DOCUMENTOS_WRITE, label: 'Gestionar documentos del expediente' },
      { code: PERMISOS.BIOMETRIA_WRITE, label: 'Registrar rostros (Face ID)' },
    ],
  },
  {
    id: 'historial',
    label: 'Contratos e historial',
    icon: 'file',
    items: [
      { code: PERMISOS.HISTORIAL_READ, label: 'Ver historial laboral' },
      { code: PERMISOS.HISTORIAL_WRITE, label: 'Editar historial laboral' },
    ],
  },
  {
    id: 'asistencia',
    label: 'Asistencia',
    icon: 'clock',
    items: [
      { code: PERMISOS.ASISTENCIA_READ, label: 'Ver asistencia' },
      { code: PERMISOS.ASISTENCIA_WRITE, label: 'Registrar asistencia' },
    ],
  },
  {
    id: 'ausencias',
    label: 'Ausencias',
    icon: 'calendar',
    items: [
      { code: PERMISOS.AUSENCIAS_READ, label: 'Ver ausencias' },
      { code: PERMISOS.AUSENCIAS_WRITE, label: 'Solicitar ausencias' },
      { code: PERMISOS.AUSENCIAS_APPROVE, label: 'Aprobar ausencias' },
    ],
  },
  {
    id: 'horarios',
    label: 'Horarios',
    icon: 'schedule',
    items: [
      { code: PERMISOS.HORARIOS_READ, label: 'Ver horarios' },
      { code: PERMISOS.HORARIOS_WRITE, label: 'Editar horarios' },
      { code: PERMISOS.MI_HORARIO_READ, label: 'Ver mi horario' },
    ],
  },
  {
    id: 'nomina',
    label: 'Nómina',
    icon: 'money',
    items: [
      { code: PERMISOS.NOMINA_READ, label: 'Ver nómina' },
      { code: PERMISOS.NOMINA_WRITE, label: 'Editar nómina' },
      { code: PERMISOS.NOMINA_APPROVE, label: 'Aprobar nómina' },
      { code: PERMISOS.COMPROBANTES_READ, label: 'Ver comprobantes de pago' },
    ],
  },
  {
    id: 'reclutamiento',
    label: 'Reclutamiento y evaluaciones',
    icon: 'check',
    items: [
      { code: PERMISOS.RECLUTAMIENTO_READ, label: 'Ver reclutamiento' },
      { code: PERMISOS.RECLUTAMIENTO_WRITE, label: 'Editar reclutamiento' },
      { code: PERMISOS.EVALUACIONES_READ, label: 'Ver evaluaciones' },
      { code: PERMISOS.EVALUACIONES_WRITE, label: 'Editar evaluaciones' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración y reportes',
    icon: 'settings',
    items: [
      { code: PERMISOS.CATALOGOS_WRITE, label: 'Editar catálogos' },
      { code: PERMISOS.EMPRESAS_WRITE, label: 'Editar datos de la empresa' },
      { code: PERMISOS.USUARIOS_WRITE, label: 'Administrar usuarios' },
      { code: PERMISOS.ROLES_WRITE, label: 'Administrar roles y permisos' },
      { code: PERMISOS.REPORTES_READ, label: 'Ver reportes' },
    ],
  },
]

/** Todos los permisos que un rol propio puede tener, en orden de pantalla. */
export const ASSIGNABLE_PERMISSIONS: Permiso[] = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.code)
)

const LABELS = new Map<string, string>(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.code, i.label] as const))
)

export function permissionLabel(code: string): string {
  return LABELS.get(code) ?? code
}

/**
 * Permiso → el que necesita para tener sentido (escribir exige ver).
 *
 * ESPEJO de `sgrh_private.permiso_requisitos()` en la migración
 * 20261109031500_roles_por_empresa.sql, que es quien manda: la RPC rechaza un
 * rol que no las cumpla. Acá sirven para marcar solas las casillas en el
 * editor. `permissions.test.ts` compara las dos listas.
 */
export const REQUISITOS: Readonly<Partial<Record<Permiso, Permiso>>> = {
  [PERMISOS.EMPLEADOS_WRITE]: PERMISOS.EMPLEADOS_READ,
  [PERMISOS.FOTOS_READ]: PERMISOS.EMPLEADOS_READ,
  [PERMISOS.DOCUMENTOS_READ]: PERMISOS.EMPLEADOS_READ,
  [PERMISOS.DOCUMENTOS_WRITE]: PERMISOS.DOCUMENTOS_READ,
  [PERMISOS.BIOMETRIA_WRITE]: PERMISOS.EMPLEADOS_READ,
  [PERMISOS.HISTORIAL_READ]: PERMISOS.EMPLEADOS_READ,
  [PERMISOS.HISTORIAL_WRITE]: PERMISOS.HISTORIAL_READ,
  [PERMISOS.ASISTENCIA_WRITE]: PERMISOS.ASISTENCIA_READ,
  [PERMISOS.AUSENCIAS_WRITE]: PERMISOS.AUSENCIAS_READ,
  [PERMISOS.AUSENCIAS_APPROVE]: PERMISOS.AUSENCIAS_READ,
  [PERMISOS.HORARIOS_WRITE]: PERMISOS.HORARIOS_READ,
  [PERMISOS.NOMINA_WRITE]: PERMISOS.NOMINA_READ,
  [PERMISOS.NOMINA_APPROVE]: PERMISOS.NOMINA_READ,
  [PERMISOS.RECLUTAMIENTO_WRITE]: PERMISOS.RECLUTAMIENTO_READ,
  [PERMISOS.EVALUACIONES_WRITE]: PERMISOS.EVALUACIONES_READ,
}

/** Agrega a `code` y, en cadena, todo lo que necesita (DOCUMENTOS_WRITE → DOCUMENTOS_READ → EMPLEADOS_READ). */
export function checkPermission(selected: readonly string[], code: Permiso): Permiso[] {
  const result = new Set<string>(selected)
  let current: Permiso | undefined = code
  while (current) {
    result.add(current)
    current = REQUISITOS[current]
  }
  return sortPermissions([...result])
}

/** Quita a `code` y, en cadena, todo lo que dependía de él (sin «Ver empleados» no hay «Editar empleados»). */
export function uncheckPermission(selected: readonly string[], code: Permiso): Permiso[] {
  const removed = new Set<string>([code])
  let changed = true
  while (changed) {
    changed = false
    for (const [perm, needs] of Object.entries(REQUISITOS)) {
      if (needs && removed.has(needs) && !removed.has(perm)) {
        removed.add(perm)
        changed = true
      }
    }
  }
  return sortPermissions(selected.filter((p) => !removed.has(p)))
}

/** Lo que se desmarcaría junto con `code` (para avisarlo en la casilla). */
export function dependentsOf(code: Permiso): Permiso[] {
  const remaining = new Set(uncheckPermission(ASSIGNABLE_PERMISSIONS, code))
  return ASSIGNABLE_PERMISSIONS.filter((p) => p !== code && !remaining.has(p))
}

/** Completa las dependencias de un conjunto (p. ej. al duplicar un rol). */
export function withRequirements(selected: readonly string[]): Permiso[] {
  return sortPermissions(selected).reduce<Permiso[]>(
    (acc, code) => checkPermission(acc, code),
    sortPermissions(selected)
  )
}

/** Solo los asignables, sin repetidos y en el orden de la pantalla. */
export function sortPermissions(codes: readonly string[]): Permiso[] {
  const set = new Set(codes)
  return ASSIGNABLE_PERMISSIONS.filter((p) => set.has(p))
}
