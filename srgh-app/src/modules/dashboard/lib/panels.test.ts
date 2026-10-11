import { describe, expect, it } from 'vitest'
import { PERMISOS } from '@/lib/permissions/catalog'
import { DEFAULT_PREFS, dashboardPrefsSchema, resolvePanels, toPrefs } from './panels'

const ALL = [
  PERMISOS.ASISTENCIA_READ,
  PERMISOS.EMPLEADOS_READ,
  PERMISOS.NOMINA_READ,
  PERMISOS.RECLUTAMIENTO_READ,
  PERMISOS.MI_HORARIO_READ,
  PERMISOS.NOMINA_WRITE,
  PERMISOS.AUSENCIAS_READ,
  PERMISOS.EVALUACIONES_READ,
  PERMISOS.HORARIOS_READ,
]

const ids = (panels: { id: string }[]) => panels.map((panel) => panel.id)

describe('resolvePanels', () => {
  it('gives every allowed panel, in the default order, when nothing was chosen', () => {
    expect(ids(resolvePanels(DEFAULT_PREFS, ALL))).toEqual([
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
      'my-absences',
      'my-evaluations',
      'team-schedule',
      'absences',
      'evaluations',
      'contracts',
    ])
  })

  it('starts the optional panels hidden, until the person arranges the dashboard', () => {
    const untouched = resolvePanels(DEFAULT_PREFS, ALL)
    expect(untouched.filter((panel) => panel.hidden).map((panel) => panel.id)).toEqual([
      'tardiness',
      'new-hires',
      'settlements',
      'absences',
      'evaluations',
      'contracts',
    ])

    /* Once saved, the order names the panel: only `hidden` decides. */
    const shown = resolvePanels({ order: ['tardiness'], hidden: [], sizes: {} }, ALL)
    expect(shown.find((panel) => panel.id === 'tardiness')?.hidden).toBe(false)
  })

  it('leaves out the panels the role cannot open', () => {
    expect(ids(resolvePanels(DEFAULT_PREFS, [PERMISOS.NOMINA_READ]))).toEqual(['payroll'])
  })

  it('follows the chosen order and appends the panels it does not mention', () => {
    const panels = resolvePanels({ order: ['payroll', 'attendance'], hidden: [], sizes: {} }, ALL)

    expect(ids(panels).slice(0, 2)).toEqual(['payroll', 'attendance'])
    expect(ids(panels)).toHaveLength(17)
  })

  it('drops from a stored order what the role lost, and ignores duplicates', () => {
    const panels = resolvePanels(
      { order: ['payroll', 'attendance', 'payroll'], hidden: [], sizes: {} },
      [PERMISOS.NOMINA_READ]
    )

    expect(ids(panels)).toEqual(['payroll'])
  })

  it('keeps hidden panels in the list, flagged, so they can be shown again', () => {
    const panels = resolvePanels({ order: [], hidden: ['team'], sizes: { attendance: 6 } }, ALL)

    expect(panels.find((panel) => panel.id === 'team')?.hidden).toBe(true)
    expect(panels.find((panel) => panel.id === 'attendance')?.size).toBe(6)
    expect(panels.find((panel) => panel.id === 'payroll')?.size).toBe(3)
  })
})

describe('toPrefs', () => {
  it('round-trips, storing only the sizes that differ from the default', () => {
    const prefs = { order: ['team', 'payroll'], hidden: ['payroll'], sizes: { team: 6 } } as const
    const stored = toPrefs(
      resolvePanels({ ...prefs, order: [...prefs.order], hidden: ['payroll'] }, ALL)
    )

    expect(stored.order.slice(0, 2)).toEqual(['team', 'payroll'])
    /* The optional panels were never arranged, so they are stored as what
       they still are: hidden. */
    expect(stored.hidden).toEqual([
      'payroll',
      'tardiness',
      'new-hires',
      'settlements',
      'absences',
      'evaluations',
      'contracts',
    ])
    expect(stored.sizes).toEqual({ team: 6 })
  })
})

describe('dashboardPrefsSchema', () => {
  it('rejects panels and sizes that do not exist', () => {
    expect(dashboardPrefsSchema.safeParse({ order: ['nope'], hidden: [], sizes: {} }).success).toBe(
      false
    )
    expect(
      dashboardPrefsSchema.safeParse({ order: [], hidden: [], sizes: { team: 5 } }).success
    ).toBe(false)
  })
})
