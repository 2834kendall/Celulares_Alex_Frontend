import { PERMISOS } from '@/lib/permissions/catalog'

/**
 * Registro único de Configuración (SGRH-92): qué ajustes existen, cómo se
 * agrupan y quién los ve. De acá salen el menú de modo configuración
 * (SettingsSidebarNav), el buscador (SettingsSearch), el redirect de
 * /settings y de cada módulo, y el guard de cada subpágina.
 *
 * Dos niveles:
 * - Empresa: ajustes de toda la empresa (formato de hora, apariencia).
 * - Módulos: los mismos módulos del menú principal (sus ids son las claves
 *   de zona de lib/permissions/zones.ts, para usar los mismos íconos), cada
 *   uno con sus catálogos como hojas.
 *
 * Configuración solo COMPONE: el código de cada catálogo vive en su módulo
 * dueño. Agregar un ajuste = una hoja acá + su page.tsx en
 * app/(dashboard)/settings/<href>.
 *
 * `visible` es UX y primera barrera; la autorización real sigue en el
 * requirePermission de cada acción y en la RLS.
 */

export interface SettingsLeaf {
  id: string
  label: string
  /** Encabezado de la subpágina. */
  description: string
  href: string
  /** Otras palabras con las que alguien buscaría este ajuste (Ctrl+K). */
  keywords: string[]
  visible: (permisos: readonly string[]) => boolean
}

export type SettingsModuleId = 'employees' | 'attendance' | 'recruitment'

export interface SettingsModule {
  id: SettingsModuleId
  label: string
  children: SettingsLeaf[]
}

export interface SettingsTree {
  company: SettingsLeaf[]
  modules: SettingsModule[]
}

/** Quien llega a /settings ya pasó ACCESO_CONFIGURACION (lo exige el layout). */
const always = () => true
const catalogWriters = (permisos: readonly string[]) => permisos.includes(PERMISOS.CATALOGOS_WRITE)

export const SETTINGS_TREE: SettingsTree = {
  company: [
    {
      id: 'profile',
      label: 'Datos de la empresa',
      description: 'Nombre, logo, contacto y dirección de la empresa.',
      href: '/settings/profile',
      keywords: [
        'empresa',
        'logo',
        'nombre comercial',
        'razon social',
        'cedula juridica',
        'telefono',
        'correo',
        'direccion',
        'representante legal',
        'ciiu',
        'actividad economica',
      ],
      // Lo mismo que exige empresas_update.
      visible: (permisos) => permisos.includes(PERMISOS.EMPRESAS_WRITE),
    },
    {
      id: 'general',
      label: 'General',
      description: 'Preferencias que aplican a todas las sucursales de la empresa.',
      href: '/settings/general',
      keywords: ['formato de hora', '12 horas', '24 horas', 'am pm', 'reloj'],
      // Afecta a toda la empresa: el mismo permiso que exige la RLS.
      visible: (permisos) => permisos.includes(PERMISOS.EMPRESAS_WRITE),
    },
    {
      id: 'appearance',
      label: 'Apariencia',
      description: 'Colores del menú y de los botones de cada sucursal.',
      href: '/settings/appearance',
      keywords: ['colores', 'tema', 'sucursal', 'acento', 'menu'],
      visible: always,
    },
  ],
  modules: [
    {
      id: 'employees',
      label: 'Empleados',
      children: [
        {
          id: 'positions',
          label: 'Puestos',
          description: 'Los puestos que se asignan al contratar y en cada contrato.',
          href: '/settings/employees/positions',
          keywords: ['cargo', 'posicion', 'puesto de trabajo', 'salario de referencia'],
          // Se ve en solo lectura sin CATALOGOS_WRITE.
          visible: always,
        },
      ],
    },
    {
      id: 'attendance',
      label: 'Asistencia',
      children: [
        {
          id: 'tardiness-types',
          label: 'Tipos de tardía',
          description: 'Desde qué minuto de atraso empieza cada tipo y si suma a la advertencia.',
          href: '/settings/attendance/tardiness-types',
          keywords: ['atraso', 'llegada tarde', 'minutos', 'advertencia', 'tardanza'],
          visible: always,
        },
      ],
    },
    {
      id: 'recruitment',
      label: 'Reclutamiento',
      // Sus lecturas exigen CATALOGOS_WRITE: sin él no hay nada que mostrar.
      children: [
        {
          id: 'stages',
          label: 'Etapas de selección',
          description: 'El orden de las etapas define el embudo del proceso de selección.',
          href: '/settings/recruitment/stages',
          keywords: ['embudo', 'proceso de seleccion', 'etapa', 'pipeline'],
          visible: catalogWriters,
        },
        {
          id: 'criteria',
          label: 'Criterios de selección',
          description: 'Áreas y criterios con los que se puntúa a cada candidato.',
          href: '/settings/recruitment/criteria',
          keywords: ['puntaje', 'rubros', 'areas', 'evaluacion de candidatos'],
          visible: catalogWriters,
        },
      ],
    },
  ],
}

/** El árbol podado a lo que el usuario ve: sin hojas ocultas ni módulos vacíos. */
export function visibleTree(permisos: readonly string[]): SettingsTree {
  return {
    company: SETTINGS_TREE.company.filter((leaf) => leaf.visible(permisos)),
    modules: SETTINGS_TREE.modules
      .map((mod) => ({ ...mod, children: mod.children.filter((leaf) => leaf.visible(permisos)) }))
      .filter((mod) => mod.children.length > 0),
  }
}

/**
 * Primer ajuste visible, para el redirect de /settings (o de un módulo, con
 * `moduleId`). null si no hay ninguno.
 */
export function firstVisibleHref(
  permisos: readonly string[],
  moduleId?: SettingsModuleId
): string | null {
  const tree = visibleTree(permisos)
  if (moduleId) {
    return tree.modules.find((mod) => mod.id === moduleId)?.children[0]?.href ?? null
  }
  return tree.company[0]?.href ?? tree.modules[0]?.children[0]?.href ?? null
}

export interface LocatedLeaf {
  leaf: SettingsLeaf
  /** Cómo se llega: "Empleados / Puestos", o solo "General" en Empresa. */
  path: string
}

/** Todas las hojas visibles con su ruta legible, en el orden del menú. */
export function visibleLeaves(permisos: readonly string[]): LocatedLeaf[] {
  const tree = visibleTree(permisos)
  return [
    ...tree.company.map((leaf) => ({ leaf, path: leaf.label })),
    ...tree.modules.flatMap((mod) =>
      mod.children.map((leaf) => ({ leaf, path: `${mod.label} / ${leaf.label}` }))
    ),
  ]
}

/** La hoja si existe y el usuario la ve; null en cualquier otro caso. */
export function findVisibleLeaf(id: string, permisos: readonly string[]): LocatedLeaf | null {
  return visibleLeaves(permisos).find((located) => located.leaf.id === id) ?? null
}

/** Minúsculas y sin tildes: "Tardía" y "tardia" tienen que encontrarse igual. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Buscador de ajustes (Ctrl+K). Cada palabra de la consulta tiene que
 * aparecer en el nombre, la ruta o las palabras clave. Con unas decenas de
 * ajustes no hace falta búsqueda difusa. Solo devuelve lo que el usuario ve.
 */
export function searchSettings(query: string, permisos: readonly string[]): LocatedLeaf[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const leaves = visibleLeaves(permisos)
  if (terms.length === 0) return leaves

  return leaves.filter(({ leaf, path }) => {
    const haystack = normalize([path, leaf.label, ...leaf.keywords].join(' '))
    return terms.every((term) => haystack.includes(term))
  })
}
