import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyWeekWidget } from './MyWeekWidget'
import { MyEvaluationsWidget } from './MyEvaluationsWidget'
import { TeamWidget } from './TeamWidget'
import type { MyDayAssignment } from '@/modules/schedules/actions/getMySchedule'
import type { MyEvaluation } from '../lib/extras'

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  )
})
afterEach(() => vi.unstubAllGlobals())

const day = (patch: Partial<MyDayAssignment> = {}): MyDayAssignment => ({
  date: '2026-11-02',
  isDayOff: false,
  isHoliday: false,
  scheduleId: 1,
  scheduleName: 'Diurno',
  scheduleColor: null,
  isCustom: false,
  startTime: '08:00',
  endTime: '16:00',
  hours: 8,
  observaciones: null,
  branchName: 'Central',
  ...patch,
})
const evaluations: MyEvaluation[] = [
  { id: 1, fecha: '1 oct 2026', fechaCorta: 'oct 26', promedio: 6, periodo: 'Mensual' },
  { id: 2, fecha: '1 nov 2026', fechaCorta: 'nov 26', promedio: 9, periodo: 'Sorpresa' },
]

describe('personal weekly dashboard', () => {
  it('explains missing schedules and links to the personal schedule', () => {
    render(<MyWeekWidget days={[]} weeklyTotal={0} todayIso="2026-11-02" />)
    expect(
      screen.getByText('Todavía no tenés horario cargado para esta semana.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Mi semana' })).toHaveAttribute(
      'href',
      '/my-schedule'
    )
  })
  it('selects today and changes the detail through keyboard activation', async () => {
    render(
      <MyWeekWidget
        days={[day(), day({ date: '2026-11-03', isDayOff: true })]}
        weeklyTotal={8}
        todayIso="2026-11-03"
      />
    )
    const buttons = within(screen.getByRole('group', { name: 'Días de la semana' })).getAllByRole(
      'button'
    )
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Día libre')).toBeInTheDocument()
    buttons[0].focus()
    await userEvent.keyboard('{Enter}')
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Diurno · Central')).toBeInTheDocument()
    expect(screen.getByText('8 h')).toBeInTheDocument()
  })
  it.each([
    [{ isHoliday: true, isDayOff: true }, 'Feriado'],
    [{ isDayOff: true }, 'Día libre'],
    [{ startTime: null }, 'Sin turno asignado'],
    [{ endTime: null }, 'Sin turno asignado'],
  ] as const)('shows the correct nonworking state %s', (patch, text) => {
    render(<MyWeekWidget days={[day(patch)]} weeklyTotal={7.5} todayIso="2026-12-01" />)
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByText('7.5 h')).toBeInTheDocument()
    expect(screen.queryByText('Diurno · Central')).not.toBeInTheDocument()
  })
  it('updates the detail on pointer selection and omits absent schedule metadata', () => {
    render(
      <MyWeekWidget
        days={[day(), day({ date: '2026-11-03', scheduleName: null, branchName: 'Norte' })]}
        weeklyTotal={16}
        todayIso="2026-11-02"
      />
    )
    fireEvent.pointerEnter(screen.getAllByRole('button')[1])
    expect(screen.getByText('Norte')).toBeInTheDocument()
    expect(screen.queryByText('Diurno · Central')).not.toBeInTheDocument()
  })
})

describe('personal evaluation dashboard', () => {
  it('shows an empty state without a gauge or history', () => {
    render(<MyEvaluationsWidget summary={{ evaluations: [], delta: null }} />)
    expect(screen.getByText('Todavía no tenés evaluaciones registradas.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
  it('shows a single evaluation without a trend or history strip', () => {
    render(<MyEvaluationsWidget summary={{ evaluations: [evaluations[0]], delta: null }} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Mensual · 1 oct 2026')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/respecto a la anterior/)).not.toBeInTheDocument()
  })
  it('previews an older evaluation and restores the latest on pointer leave', () => {
    render(<MyEvaluationsWidget summary={{ evaluations, delta: 3 }} />)
    expect(screen.getByText('+3 respecto a la anterior')).toBeInTheDocument()
    fireEvent.pointerEnter(screen.getAllByRole('listitem')[0])
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.queryByText(/respecto a la anterior/)).not.toBeInTheDocument()
    fireEvent.pointerLeave(screen.getByRole('list'))
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('+3 respecto a la anterior')).toBeInTheDocument()
  })
  it.each([-2, 0])('shows a negative trend or suppresses an unchanged score (%s)', (delta) => {
    render(<MyEvaluationsWidget summary={{ evaluations, delta }} />)
    if (delta < 0) expect(screen.getByText('−2 respecto a la anterior')).toBeInTheDocument()
    else expect(screen.queryByText(/respecto a la anterior/)).not.toBeInTheDocument()
  })
})

describe('team dashboard', () => {
  it('explains an empty active roster and links to employees', () => {
    render(<TeamWidget team={[]} />)
    expect(screen.getByText('No hay colaboradores con contrato vigente.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Equipo por sucursal' })).toHaveAttribute(
      'href',
      '/employees'
    )
  })
  it('uses the singular active collaborator label', () => {
    render(<TeamWidget team={[{ sucursal: 'Central', count: 1 }]} />)
    expect(screen.getByText('colaborador activo')).toBeInTheDocument()
  })
  it('computes branch percentages from the entire roster and clears them on leave', () => {
    render(
      <TeamWidget
        team={[
          { sucursal: 'Central', count: 3 },
          { sucursal: 'Norte', count: 1 },
        ]}
      />
    )
    fireEvent.pointerEnter(screen.getByText('Central').closest('li')!)
    expect(screen.getByText('75%')).toBeInTheDocument()
    fireEvent.pointerLeave(screen.getByRole('list'))
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })
  it.each([7, 8])(
    'limits visible branches to six and totals the remaining %s branches',
    (count) => {
      render(
        <TeamWidget
          team={Array.from({ length: count }, (_, i) => ({
            sucursal: `Sucursal ${i}`,
            count: i + 1,
          }))}
        />
      )
      expect(screen.getAllByRole('listitem')).toHaveLength(6)
      expect(screen.queryByText('Sucursal 6')).not.toBeInTheDocument()
      expect(
        screen.getByText(
          count === 7
            ? 'y 1 sucursal más, con 7 colaboradores'
            : 'y 2 sucursales más, con 15 colaboradores'
        )
      ).toBeInTheDocument()
    }
  )
})
