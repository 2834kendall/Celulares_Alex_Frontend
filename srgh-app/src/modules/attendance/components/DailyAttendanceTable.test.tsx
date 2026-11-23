import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyAttendanceTable } from './DailyAttendanceTable'
import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'

vi.mock('@/modules/attendance/actions/saveManualMark', () => ({ saveManualMark: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/attendance',
  useRouter: () => ({ push: vi.fn() }),
}))

function makeRow(overrides: Partial<DailyAttendanceRow> = {}): DailyAttendanceRow {
  return {
    employmentHistoryId: 1,
    employeeId: 10,
    fullName: 'Ana Perez',
    fotoUrl: null,
    position: 'Cajera',
    branchId: 100,
    isDayOff: false,
    isHoliday: false,
    ausencia: null,
    expectedStart: '08:00',
    entrada: { id: 1, time: '08:04', diffMinutes: 4 },
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    blocks: [],
    duplicateMarksCount: 0,
    isOpen: true,
    tardiness: null,
    lunchTardiness: null,
    secondBlockTardiness: null,
    lunchExcessMinutes: null,
    breakExcessMinutes: null,
    ...overrides,
  }
}

/**
 * El componente rinde la MISMA data dos veces: cards en movil (`md:hidden`) y
 * tabla desde `md:`. En un navegador solo una existe — `hidden` es
 * `display:none` y la otra rama sale del arbol de accesibilidad. jsdom no
 * aplica CSS, asi que aca conviven y cualquier consulta global encuentra dos
 * coincidencias. Por eso se consulta DENTRO de la rama que interesa, en vez
 * de relajar los tests a getAllBy* y perder de vista cual se esta probando.
 */
function tabla() {
  return within(screen.getByRole('table'))
}

function cards() {
  return within(screen.getByRole('list'))
}

describe('<DailyAttendanceTable />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio cuando no hay colaboradores', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[]} canWrite={true} />)

    expect(screen.getByText('No hay colaboradores activos en esta sucursal')).toBeInTheDocument()
  })

  it('un dia de varios bloques muestra el rango de cada uno', () => {
    const row = makeRow({
      isOpen: false,
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        {
          entrada: { id: 3, time: '13:00', diffMinutes: null },
          salida: { id: 4, time: '17:00', diffMinutes: null },
        },
      ],
    })

    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite={true} />)

    const bloques = tabla().getByTitle('Bloques del dia')
    expect(bloques).toHaveTextContent('08:04–12:00')
    expect(bloques).toHaveTextContent('13:00–17:00')
    expect(tabla().queryByText(/duplicada/)).not.toBeInTheDocument()
  })

  it('con el ultimo bloque abierto, el rango queda sin hora de salida', () => {
    const row = makeRow({
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        { entrada: { id: 3, time: '13:00', diffMinutes: null }, salida: null },
      ],
    })

    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite={true} />)

    expect(tabla().getByTitle('Bloques del dia')).toHaveTextContent('13:00–…')
    expect(tabla().getByText('Sin salida')).toBeInTheDocument()
  })

  it('un dia de un solo bloque no muestra el indicador de bloques', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(tabla().queryByTitle('Bloques del dia')).not.toBeInTheDocument()
  })

  it('lista un colaborador con su entrada y el estado de jornada abierta', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(tabla().getByText('Ana Perez')).toBeInTheDocument()
    expect(tabla().getByText('08:04')).toBeInTheDocument()
    expect(tabla().getByText('Sin salida')).toBeInTheDocument()
  })

  it('en movil rinde la misma jornada como card, con las cuatro marcas etiquetadas', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(cards().getByText('Ana Perez')).toBeInTheDocument()
    expect(cards().getByText('08:04')).toBeInTheDocument()
    expect(cards().getByText('Sin salida')).toBeInTheDocument()

    // Sin encabezados de tabla, cada marca necesita su propia etiqueta.
    for (const label of ['Entrada', 'Inicio almuerzo', 'Fin almuerzo', 'Salida']) {
      expect(cards().getByText(label)).toBeInTheDocument()
    }
  })

  it('oculta los botones de corregir/agregar marca cuando canWrite es false', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={false} />)

    expect(screen.queryByLabelText('Corregir marca')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agregar marca')).not.toBeInTheDocument()
  })

  it('abre el modal de correccion con los datos de la marca existente', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    await userEvent.click(tabla().getByLabelText('Corregir marca'))

    const modal = screen.getByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
    expect(within(modal).getByText(/Ana Perez/)).toBeInTheDocument()
  })

  describe('dia de varios bloques', () => {
    const dosBloques = makeRow({
      isOpen: false,
      entrada: { id: 1, time: '08:04', diffMinutes: 4 },
      salida: { id: 4, time: '17:00', diffMinutes: null },
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        {
          entrada: { id: 3, time: '13:00', diffMinutes: null },
          salida: { id: 4, time: '17:00', diffMinutes: null },
        },
      ],
    })

    it('permite corregir la marca de un bloque intermedio', async () => {
      render(<DailyAttendanceTable dateISO="2026-07-25" rows={[dosBloques]} canWrite={true} />)

      // La salida de las 12:00 y la entrada de las 13:00 no estan en la fila:
      // solo se alcanzan desde el indicador de bloques.
      await userEvent.click(tabla().getByLabelText('Corregir salida de las 12:00'))

      const modal = screen.getByRole('dialog')
      expect(within(modal).getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
      expect(within(modal).getByText(/Salida/)).toBeInTheDocument()
    })

    it('muestra el atraso del segundo bloque, y justificado deja de reclamar atencion', () => {
      const tarde = makeRow({
        ...dosBloques,
        secondBlockTardiness: {
          tipo: { nombre: 'Tardia grave', color: '#E11D48' },
          diffMinutes: 12,
          isJustified: false,
          justification: null,
        },
      })
      const { rerender } = render(
        <DailyAttendanceTable dateISO="2026-07-25" rows={[tarde]} canWrite={true} />
      )

      expect(tabla().getByText(/2\.º bloque \+/)).not.toHaveTextContent('justificada')

      rerender(
        <DailyAttendanceTable
          dateISO="2026-07-25"
          rows={[
            {
              ...tarde,
              secondBlockTardiness: {
                ...tarde.secondBlockTardiness!,
                isJustified: true,
                justification: 'Fallo del sistema',
              },
            },
          ]}
          canWrite={true}
        />
      )

      expect(tabla().getByText(/2\.º bloque \+/)).toHaveTextContent('justificada')
    })

    it('sin atraso en el segundo bloque no aparece la etiqueta', () => {
      render(<DailyAttendanceTable dateISO="2026-07-25" rows={[dosBloques]} canWrite={true} />)

      expect(tabla().queryByText(/2\.º bloque \+/)).not.toBeInTheDocument()
    })

    it('sin permiso de escritura las horas del bloque no son botones', () => {
      render(<DailyAttendanceTable dateISO="2026-07-25" rows={[dosBloques]} canWrite={false} />)

      expect(tabla().queryByLabelText('Corregir salida de las 12:00')).not.toBeInTheDocument()
      expect(tabla().getByTitle('Bloques del dia')).toHaveTextContent('13:00–17:00')
    })
  })

  it('abre el modal de agregar marca cuando la celda esta vacia', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    // Todo menos la entrada viene null en makeRow(): esas celdas muestran
    // "Agregar marca", se toma la primera.
    await userEvent.click(tabla().getAllByLabelText('Agregar marca')[0])

    expect(screen.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
  })
})
