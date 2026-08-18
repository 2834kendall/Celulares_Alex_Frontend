import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyScheduleView } from './MyScheduleView'
import type { MyDayAssignment } from '@/modules/schedules/actions/getMySchedule'

const WEEK_DATES = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
]

function makeDay(date: string, overrides: Partial<MyDayAssignment> = {}): MyDayAssignment {
  return {
    date,
    isDayOff: false,
    isHoliday: false,
    scheduleName: null,
    startTime: null,
    endTime: null,
    hours: 0,
    observaciones: null,
    ...overrides,
  }
}

describe('MyScheduleView', () => {
  it('muestra el turno, el horario y las horas de un dia asignado', () => {
    const days = WEEK_DATES.map((date, i) =>
      i === 1
        ? makeDay(date, {
            scheduleName: 'Turno A',
            startTime: '08:00:00',
            endTime: '17:00:00',
            hours: 8,
          })
        : makeDay(date)
    )

    render(
      <MyScheduleView
        weekStartISO={WEEK_DATES[0]}
        weekDates={WEEK_DATES}
        days={days}
        weeklyTotal={8}
      />
    )

    expect(screen.getByText('Turno A')).toBeInTheDocument()
    expect(screen.getByText('08:00 - 17:00')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('marca dia libre y feriado con su badge, sin mostrar horario', () => {
    const days = WEEK_DATES.map((date, i) => {
      if (i === 0) return makeDay(date, { isDayOff: true })
      if (i === 1) return makeDay(date, { isHoliday: true, observaciones: 'Feriado pagado' })
      return makeDay(date)
    })

    render(
      <MyScheduleView
        weekStartISO={WEEK_DATES[0]}
        weekDates={WEEK_DATES}
        days={days}
        weeklyTotal={0}
      />
    )

    expect(screen.getByText('Día libre')).toBeInTheDocument()
    expect(screen.getByText('Feriado')).toBeInTheDocument()
    expect(screen.getByText('Feriado pagado')).toBeInTheDocument()
  })

  it('sin asignacion, muestra "Sin asignar" para ese dia', () => {
    const days = WEEK_DATES.map((date) => makeDay(date))

    render(
      <MyScheduleView
        weekStartISO={WEEK_DATES[0]}
        weekDates={WEEK_DATES}
        days={days}
        weeklyTotal={0}
      />
    )

    expect(screen.getAllByText('Sin asignar')).toHaveLength(7)
  })

  it('muestra el total semanal en el pie de la tabla', () => {
    const days = WEEK_DATES.map((date, i) =>
      i < 5 ? makeDay(date, { hours: 8, scheduleName: 'Turno A' }) : makeDay(date)
    )

    render(
      <MyScheduleView
        weekStartISO={WEEK_DATES[0]}
        weekDates={WEEK_DATES}
        days={days}
        weeklyTotal={40}
      />
    )

    expect(screen.getByText('40 h')).toBeInTheDocument()
  })

  it('los enlaces de semana anterior/siguiente apuntan a la fecha correcta', () => {
    render(
      <MyScheduleView
        weekStartISO="2026-01-05"
        weekDates={WEEK_DATES}
        days={WEEK_DATES.map((d) => makeDay(d))}
        weeklyTotal={0}
      />
    )

    expect(screen.getByLabelText('Semana anterior')).toHaveAttribute('href', '?week=2025-12-29')
    expect(screen.getByLabelText('Semana siguiente')).toHaveAttribute('href', '?week=2026-01-12')
  })
})
