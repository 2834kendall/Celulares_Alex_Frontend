import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthlySummaryTable } from './MonthlySummaryTable'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/attendance',
  useSearchParams: () => new URLSearchParams(),
}))

function makeRow(overrides: Partial<MonthlyEmployeeSummary> = {}): MonthlyEmployeeSummary {
  return {
    employeeId: 10,
    employmentHistoryId: 1,
    fullName: 'Ana Perez',
    tardias: 0,
    ausencias: 0,
    tardyDays: [],
    absentDays: [],
    ...overrides,
  }
}

describe('<MonthlySummaryTable />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio sin colaboradores', () => {
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[]} />)

    expect(screen.getByText('No hay colaboradores activos en esta sucursal')).toBeInTheDocument()
  })

  it('lista a los colaboradores con sus totales del mes', () => {
    render(
      <MonthlySummaryTable monthISO="2026-07-01" rows={[makeRow({ tardias: 2, ausencias: 1 })]} />
    )

    const row = screen.getByRole('row', { name: /Ana Perez/ })
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByText('1')).toBeInTheDocument()
  })

  it('no muestra boton de expandir si no tiene tardias ni ausencias', () => {
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[makeRow()]} />)

    expect(screen.queryByLabelText('Ver dias')).not.toBeInTheDocument()
  })

  it('expande y colapsa el detalle de dias', async () => {
    const user = userEvent.setup()
    render(
      <MonthlySummaryTable
        monthISO="2026-07-01"
        rows={[
          makeRow({
            tardias: 1,
            ausencias: 1,
            tardyDays: [{ date: '2026-07-10', entradaTime: '08:15', diffMinutes: 15 }],
            absentDays: ['2026-07-05'],
          }),
        ]}
      />
    )

    expect(screen.queryByText(/llego a las 08:15/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Ver dias'))

    expect(screen.getByText(/llego a las 08:15 \(\+15 min\)/)).toBeInTheDocument()
    expect(screen.getByText('05-jul')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Ocultar dias'))

    expect(screen.queryByText(/llego a las 08:15/)).not.toBeInTheDocument()
  })

  it('navega al mes siguiente y anterior preservando el pathname', async () => {
    const user = userEvent.setup()
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[]} />)

    await user.click(screen.getByLabelText('Mes siguiente'))
    expect(push).toHaveBeenCalledWith('/attendance?month=2026-08-01')

    await user.click(screen.getByLabelText('Mes anterior'))
    expect(push).toHaveBeenCalledWith('/attendance?month=2026-06-01')
  })
})
