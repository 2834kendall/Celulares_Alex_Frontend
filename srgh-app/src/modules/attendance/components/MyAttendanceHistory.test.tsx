import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyAttendanceHistory } from './MyAttendanceHistory'
import type { MyAttendanceDay } from '@/modules/attendance/actions/getMyMarks'

describe('<MyAttendanceHistory />', () => {
  it('muestra el estado vacio cuando no hay marcas', () => {
    render(<MyAttendanceHistory data={[]} />)

    expect(screen.getByText('Todavia no tienes marcas registradas.')).toBeInTheDocument()
  })

  it('lista los dias con marcas, con guion para lo que falta', () => {
    const data: MyAttendanceDay[] = [
      {
        date: '2026-07-25',
        entrada: { time: '08:04' },
        inicioAlmuerzo: null,
        finAlmuerzo: null,
        salida: null,
      },
    ]

    render(<MyAttendanceHistory data={data} />)

    expect(screen.getByText('08:04')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('muestra el rango de almuerzo cuando hay inicio y fin', () => {
    const data: MyAttendanceDay[] = [
      {
        date: '2026-07-25',
        entrada: { time: '08:00' },
        inicioAlmuerzo: { time: '12:00' },
        finAlmuerzo: { time: '13:00' },
        salida: { time: '17:00' },
      },
    ]

    render(<MyAttendanceHistory data={data} />)

    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('13:00')).toBeInTheDocument()
  })
})
