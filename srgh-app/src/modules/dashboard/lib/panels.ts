import { z } from 'zod'
import { PERMISOS } from '@/lib/permissions/catalog'

/**
 * Registry of the dashboard panels and of what each person chose to do with
 * them. Single source of truth: the page decides what to load from it, the
 * board lays the panels out from it, and the "Personalizar" tray lists them
 * from it. Adding a panel = one entry here + its node in the page.
 *
 * `allowed` is UX and a first barrier, like the sidebar: each panel loads
 * through its own module's action, which checks the permission again.
 */

export const PANEL_IDS = [
  'attendance',
  'birthdays',
  'payroll',
  'recruitment',
  'anniversaries',
  'team',
  'my-week',
  'tardiness',
  'new-hires',
  'settlements',
  'my-marks',
  'absences',
  'evaluations',
  'contracts',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

/** Columns a panel takes, out of the 6 of a wide dashboard. */
export const PANEL_SIZES = [2, 3, 4, 6] as const
export type PanelSize = (typeof PANEL_SIZES)[number]

export interface PanelDefinition {
  id: PanelId
  label: string
  /** One line for the tray, so a hidden panel can be judged without opening it. */
  description: string
  defaultSize: PanelSize
  /**
   * Starts in the tray of hidden panels instead of on the dashboard: there
   * for whoever wants it, without crowding everyone else's screen.
   */
  defaultHidden?: boolean
  allowed: (permisos: readonly string[]) => boolean
}

const has = (permiso: string) => (permisos: readonly string[]) => permisos.includes(permiso)

/* The order here is the default order on screen. */
export const PANELS: readonly PanelDefinition[] = [
  {
    id: 'attendance',
    label: 'Asistencia de hoy',
    description: 'Quién llegó, quién va tarde y quién falta por marcar.',
    defaultSize: 4,
    allowed: has(PERMISOS.ASISTENCIA_READ),
  },
  {
    id: 'birthdays',
    label: 'Cumpleaños',
    description: 'Quién cumple años hoy y en los próximos días.',
    defaultSize: 2,
    allowed: has(PERMISOS.EMPLEADOS_READ),
  },
  {
    id: 'payroll',
    label: 'Nómina',
    description: 'El periodo en curso y los que siguen sin pagar.',
    defaultSize: 3,
    allowed: has(PERMISOS.NOMINA_READ),
  },
  {
    id: 'recruitment',
    label: 'Reclutamiento',
    description: 'Postulaciones en proceso, por etapa.',
    defaultSize: 3,
    allowed: has(PERMISOS.RECLUTAMIENTO_READ),
  },
  {
    id: 'anniversaries',
    label: 'Aniversarios laborales',
    description: 'Quién cumple años de trabajar en la empresa.',
    defaultSize: 3,
    allowed: has(PERMISOS.EMPLEADOS_READ),
  },
  {
    id: 'team',
    label: 'Equipo por sucursal',
    description: 'Cuántos colaboradores activos tiene cada sucursal.',
    defaultSize: 3,
    allowed: has(PERMISOS.EMPLEADOS_READ),
  },
  {
    id: 'my-week',
    label: 'Mi semana',
    description: 'Tu horario de esta semana, día por día.',
    defaultSize: 3,
    allowed: has(PERMISOS.MI_HORARIO_READ),
  },
  {
    id: 'tardiness',
    label: 'Tardías del mes',
    description: 'Quién acumula más tardías y ausencias sin justificar este mes.',
    defaultSize: 3,
    defaultHidden: true,
    allowed: has(PERMISOS.ASISTENCIA_READ),
  },
  {
    id: 'new-hires',
    label: 'Nuevos ingresos',
    description: 'Quién se unió a la empresa en los últimos 60 días.',
    defaultSize: 3,
    defaultHidden: true,
    allowed: has(PERMISOS.EMPLEADOS_READ),
  },
  {
    id: 'settlements',
    label: 'Liquidaciones pendientes',
    description: 'Contratos terminados que todavía no se liquidan.',
    defaultSize: 3,
    defaultHidden: true,
    // Lo mismo que exige la pantalla de liquidaciones.
    allowed: has(PERMISOS.NOMINA_WRITE),
  },
  {
    id: 'my-marks',
    label: 'Mis marcas de hoy',
    description: 'Tus marcas de entrada, receso, almuerzo y salida de hoy.',
    defaultSize: 3,
    // Mismo público que "Mi semana": quien tiene su propio horario.
    allowed: has(PERMISOS.MI_HORARIO_READ),
  },
  {
    id: 'absences',
    label: 'Ausencias de la semana',
    description: 'Incapacidades, vacaciones y permisos aprobados de esta semana.',
    defaultSize: 3,
    defaultHidden: true,
    allowed: has(PERMISOS.AUSENCIAS_READ),
  },
  {
    id: 'evaluations',
    label: 'Evaluaciones',
    description: 'Promedio del año y quién falta por evaluar.',
    defaultSize: 3,
    defaultHidden: true,
    allowed: (permisos) =>
      permisos.includes(PERMISOS.EVALUACIONES_READ) ||
      permisos.includes(PERMISOS.EVALUACIONES_WRITE),
  },
  {
    id: 'contracts',
    label: 'Contratos por vencer',
    description: 'Contratos que terminan en los próximos 60 días o ya vencieron.',
    defaultSize: 3,
    defaultHidden: true,
    allowed: has(PERMISOS.EMPLEADOS_READ),
  },
]

export const PANEL_BY_ID = Object.fromEntries(PANELS.map((panel) => [panel.id, panel])) as Record<
  PanelId,
  PanelDefinition
>

/**
 * What a person chose. Stored as written by the browser, so it is treated as
 * untrusted input: parsed with the schema and then passed through
 * resolvePanels, which is what the page actually uses.
 */
export const dashboardPrefsSchema = z.object({
  order: z.array(z.enum(PANEL_IDS)).max(PANEL_IDS.length * 2),
  hidden: z.array(z.enum(PANEL_IDS)).max(PANEL_IDS.length * 2),
  sizes: z.partialRecord(
    z.enum(PANEL_IDS),
    z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)])
  ),
})

export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>

export const DEFAULT_PREFS: DashboardPrefs = { order: [], hidden: [], sizes: {} }

export interface ResolvedPanel {
  id: PanelId
  label: string
  description: string
  size: PanelSize
  hidden: boolean
}

/**
 * The panels this session can have, in the order and size the person chose.
 *
 * Tolerant on purpose, because the stored preference outlives the code: a
 * panel that no longer exists or that the role lost is dropped, a duplicate
 * is ignored, and a panel added after the preference was saved shows up at
 * the end instead of staying invisible forever.
 */
export function resolvePanels(prefs: DashboardPrefs, permisos: readonly string[]): ResolvedPanel[] {
  const allowed = PANELS.filter((panel) => panel.allowed(permisos))
  const allowedIds = new Set(allowed.map((panel) => panel.id))
  const hidden = new Set(prefs.hidden)

  const ordered: PanelId[] = []
  for (const id of [...prefs.order, ...allowed.map((panel) => panel.id)]) {
    if (allowedIds.has(id) && !ordered.includes(id)) ordered.push(id)
  }

  return ordered.map((id) => {
    const panel = PANEL_BY_ID[id]
    return {
      id,
      label: panel.label,
      description: panel.description,
      size: prefs.sizes[id] ?? panel.defaultSize,
      /* A panel that starts hidden stays so until the person arranges the
         dashboard: from then on the saved order names every panel, and what
         they chose is what counts. */
      hidden: hidden.has(id) || (Boolean(panel.defaultHidden) && !prefs.order.includes(id)),
    }
  })
}

/** Back from the resolved list to what gets stored. */
export function toPrefs(panels: readonly ResolvedPanel[]): DashboardPrefs {
  const sizes: DashboardPrefs['sizes'] = {}
  for (const panel of panels) {
    if (panel.size !== PANEL_BY_ID[panel.id].defaultSize) sizes[panel.id] = panel.size
  }

  return {
    order: panels.map((panel) => panel.id),
    hidden: panels.filter((panel) => panel.hidden).map((panel) => panel.id),
    sizes,
  }
}
