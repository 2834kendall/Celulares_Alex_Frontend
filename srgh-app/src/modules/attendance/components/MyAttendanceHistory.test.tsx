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
        inicioReceso: null,
        finReceso: null,
        inicioAlmuerzo: null,
        finAlmuerzo: null,
        salida: null,
        blocks: [],
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
        inicioReceso: null,
        finReceso: null,
        inicioAlmuerzo: { time: '12:00' },
        finAlmuerzo: { time: '13:00' },
        salida: { time: '17:00' },
        blocks: [],
      },
    ]

    render(<MyAttendanceHistory data={data} />)

    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('13:00')).toBeInTheDocument()
  })

  it('un dia de varios bloques muestra la entrada y la salida de cada uno', () => {
    const data: MyAttendanceDay[] = [
      {
        date: '2026-07-25',
        entrada: { time: '07:00' },
        inicioReceso: null,
        finReceso: null,
        inicioAlmuerzo: null,
        finAlmuerzo: null,
        salida: { time: '20:00' },
        blocks: [
          { entrada: { time: '07:00' }, salida: { time: '11:00' } },
          { entrada: { time: '16:00' }, salida: { time: '20:00' } },
        ],
      },
    ]

    render(<MyAttendanceHistory data={data} />)

    for (const hora of ['07:00', '11:00', '16:00', '20:00']) {
      expect(screen.getByText(hora)).toBeInTheDocument()
    }
  })
})
