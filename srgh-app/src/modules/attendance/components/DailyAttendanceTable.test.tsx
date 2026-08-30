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
    expectedStart: '08:00',
    entrada: { id: 1, time: '08:04', diffMinutes: 4 },
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    duplicateMarksCount: 0,
    isOpen: true,
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

  it('abre el modal de agregar marca cuando la celda esta vacia', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    // inicioAlmuerzo/finAlmuerzo/salida vienen null en makeRow(): las tres
    // celdas muestran "Agregar marca", se toma la primera.
    await userEvent.click(tabla().getAllByLabelText('Agregar marca')[0])

    expect(screen.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
  })
})
