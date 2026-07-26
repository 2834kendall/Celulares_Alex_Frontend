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

    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.getByText('08:04')).toBeInTheDocument()
    expect(screen.getByText('Sin salida')).toBeInTheDocument()
  })

  it('oculta los botones de corregir/agregar marca cuando canWrite es false', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={false} />)

    expect(screen.queryByLabelText('Corregir marca')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agregar marca')).not.toBeInTheDocument()
  })

  it('abre el modal de correccion con los datos de la marca existente', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    await userEvent.click(screen.getByLabelText('Corregir marca'))

    const modal = screen.getByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
    expect(within(modal).getByText(/Ana Perez/)).toBeInTheDocument()
  })

  it('abre el modal de agregar marca cuando la celda esta vacia', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    // inicioAlmuerzo/finAlmuerzo/salida vienen null en makeRow(): las tres
    // celdas muestran "Agregar marca", se toma la primera.
    await userEvent.click(screen.getAllByLabelText('Agregar marca')[0])

    expect(screen.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
  })
})
