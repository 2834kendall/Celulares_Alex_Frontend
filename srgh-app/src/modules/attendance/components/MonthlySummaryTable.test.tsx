import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthlySummaryTable } from './MonthlySummaryTable'
import type {
  MonthlyEmployeeSummary,
  TardyDay,
} from '@/modules/attendance/actions/getMonthlyAttendanceSummary'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/attendance',
  useSearchParams: () => new URLSearchParams(),
}))

const TARDY: TardyDay = {
  date: '2026-07-10',
  kind: 'entrada',
  time: '08:15',
  diffMinutes: 15,
  tipo: { nombre: 'Tardia grave', color: '#E11D48' },
  countsTowardWarning: true,
  markId: 77,
  isJustified: false,
  justification: null,
}

function makeRow(overrides: Partial<MonthlyEmployeeSummary> = {}): MonthlyEmployeeSummary {
  return {
    employeeId: 10,
    employmentHistoryId: 1,
    fullName: 'Ana Perez',
    tardias: 0,
    ausencias: 0,
    tardyDays: [],
    absentDays: [],
    justifiedAbsences: [],
    ...overrides,
  }
}

const ANA_CON_INCIDENCIAS = makeRow({
  tardias: 1,
  ausencias: 1,
  tardyDays: [TARDY],
  absentDays: ['2026-07-05'],
})

const BRUNO_SIN_NADA = makeRow({ employeeId: 20, employmentHistoryId: 2, fullName: 'Bruno Mora' })

describe('<MonthlySummaryTable />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio sin colaboradores', () => {
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[]} />)

    expect(screen.getByText('No hay colaboradores activos en esta sucursal')).toBeInTheDocument()
  })

  it('muestra los conteos del mes como chips junto al nombre', () => {
    render(
      <MonthlySummaryTable
        monthISO="2026-07-01"
        rows={[makeRow({ tardias: 2, ausencias: 1, tardyDays: [TARDY, TARDY] })]}
      />
    )

    const fila = screen.getByRole('button', { name: /Ana Perez/ })
    expect(fila).toHaveTextContent('2 tardias')
    expect(fila).toHaveTextContent('1 ausencia')
  })

  it('arranca mostrando solo a quien tiene incidencias, y "Todos" muestra al resto', async () => {
    const user = userEvent.setup()
    render(
      <MonthlySummaryTable monthISO="2026-07-01" rows={[ANA_CON_INCIDENCIAS, BRUNO_SIN_NADA]} />
    )

    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.queryByText('Bruno Mora')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todos (2)' }))

    expect(screen.getByText('Bruno Mora')).toBeInTheDocument()
    expect(screen.getByText('Sin incidencias')).toBeInTheDocument()
  })

  it('si nadie tiene incidencias arranca en "Todos"', () => {
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[BRUNO_SIN_NADA]} />)

    expect(screen.getByText('Bruno Mora')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('expande y colapsa el detalle de dias', async () => {
    const user = userEvent.setup()
    render(<MonthlySummaryTable monthISO="2026-07-01" rows={[ANA_CON_INCIDENCIAS]} />)

    expect(screen.queryByText('Tardia grave')).not.toBeInTheDocument()

    const fila = screen.getByRole('button', { name: /Ana Perez/ })
    await user.click(fila)

    expect(fila).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Tardia grave')).toBeInTheDocument()
    expect(screen.getByText('+15 min', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('No vino y no marco')).toBeInTheDocument()

    await user.click(fila)

    expect(screen.queryByText('Tardia grave')).not.toBeInTheDocument()
  })

  it('es solo consulta: muestra lo justificado y no ofrece justificar', async () => {
    const user = userEvent.setup()
    render(
      <MonthlySummaryTable
        monthISO="2026-07-01"
        rows={[
          makeRow({
            ausencias: 1,
            absentDays: ['2026-07-05'],
            justifiedAbsences: [{ date: '2026-07-08', tipoNombre: 'Cita Médica' }],
          }),
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: /Ana Perez/ }))

    expect(screen.getByText('No vino y no marco')).toBeInTheDocument()
    expect(screen.getByText('Cita Médica')).toBeInTheDocument()
    expect(screen.getByText('Ausencia justificada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Justificar' })).not.toBeInTheDocument()
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
