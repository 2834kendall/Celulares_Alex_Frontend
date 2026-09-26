import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PendingJustifications } from './PendingJustifications'
import type {
  MonthlyEmployeeSummary,
  TardyDay,
} from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import { createAusencia } from '@/modules/absences/actions/createAusencia'
import { getAusenciaTypes } from '@/modules/absences/actions/getAusenciaTypes'

vi.mock('@/modules/attendance/actions/justifyTardiness', () => ({
  justifyTardiness: vi.fn(),
}))
vi.mock('@/modules/absences/actions/createAusencia', () => ({ createAusencia: vi.fn() }))
vi.mock('@/modules/absences/actions/getAusenciaTypes', () => ({ getAusenciaTypes: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/attendance',
  useSearchParams: () => new URLSearchParams('tab=justificar'),
}))

const mockCreateAusencia = vi.mocked(createAusencia)
const mockGetAusenciaTypes = vi.mocked(getAusenciaTypes)

function tardy(overrides: Partial<TardyDay> = {}): TardyDay {
  return {
    date: '2026-07-10',
    kind: 'entrada',
    time: '08:15',
    diffMinutes: 15,
    tipo: { nombre: 'Tardia grave', color: '#E11D48' },
    countsTowardWarning: true,
    markId: 77,
    isJustified: false,
    justification: null,
    ...overrides,
  }
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

const ROWS = [
  makeRow({
    tardyDays: [
      tardy(),
      tardy({ date: '2026-07-03', isJustified: true, justification: 'Sistema caido' }),
    ],
    justifiedAbsences: [{ date: '2026-07-08', tipoNombre: 'Cita Médica' }],
  }),
  makeRow({
    employeeId: 20,
    employmentHistoryId: 2,
    fullName: 'Bruno Mora',
    absentDays: ['2026-07-12'],
  }),
]

function renderQueue(props: Partial<Parameters<typeof PendingJustifications>[0]> = {}) {
  return render(
    <PendingJustifications
      monthISO="2026-07-01"
      rows={ROWS}
      canWrite
      canJustifyAbsences
      {...props}
    />
  )
}

describe('<PendingJustifications />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('junta lo pendiente de todo el personal, lo mas reciente primero', () => {
    renderQueue()

    expect(screen.getByRole('button', { name: 'Pendientes (2)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    // Ausencia de Bruno del 12 antes que la tardia de Ana del 10.
    expect(filas[0]).toHaveTextContent('Bruno Mora')
    expect(filas[0]).toHaveTextContent('No vino y no marco')
    expect(filas[1]).toHaveTextContent('Ana Perez')
    expect(filas[1]).toHaveTextContent('Tardia grave')
    expect(screen.getAllByRole('button', { name: 'Justificar' })).toHaveLength(2)
  })

  it('"Resueltas" muestra lo ya justificado del mes', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByRole('button', { name: 'Resueltas (2)' }))

    expect(screen.getByText('Cita Médica')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver motivo' })).toBeInTheDocument()
    expect(screen.queryByText('No vino y no marco')).not.toBeInTheDocument()
  })

  it('sin pendientes lo dice', () => {
    renderQueue({ rows: [makeRow()] })

    expect(screen.getByText('No hay nada pendiente de justificar este mes')).toBeInTheDocument()
  })

  it('sin permiso de ausencias, la ausencia se ve pero sin boton', () => {
    renderQueue({ canJustifyAbsences: false })

    expect(screen.getByText('No vino y no marco')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Justificar' })).toHaveLength(1)
  })

  it('abre el modal de la tardia con sus datos', async () => {
    const user = userEvent.setup()
    renderQueue({ rows: [ROWS[0]] })

    await user.click(screen.getByRole('button', { name: 'Justificar' }))

    expect(screen.getByRole('heading', { name: 'Justificar tardanza' })).toBeInTheDocument()
  })

  it('justifica una ausencia registrando una ausencia aprobada de ese dia', async () => {
    mockGetAusenciaTypes.mockResolvedValue({
      ok: true,
      data: [
        { tau_id: 3, tau_nombre: 'Cita Médica', tau_es_intradia: false },
        { tau_id: 9, tau_nombre: 'Permiso de Lactancia', tau_es_intradia: true },
      ] as never,
    })
    mockCreateAusencia.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderQueue({ rows: [ROWS[1]] })

    await user.click(screen.getByRole('button', { name: 'Justificar' }))

    const trigger = await screen.findByLabelText('Tipo de ausencia')
    await waitFor(() => expect(trigger).toBeEnabled())
    await user.click(trigger)
    // Lactancia es intradia: no cubre un dia completo.
    expect(screen.queryByRole('button', { name: 'Permiso de Lactancia' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cita Médica' }))
    await user.type(screen.getByLabelText('Observaciones (opcional)'), 'Aviso por telefono')
    await user.click(screen.getByRole('button', { name: 'Justificar ausencia' }))

    await waitFor(() =>
      expect(mockCreateAusencia).toHaveBeenCalledWith({
        employmentHistoryId: 2,
        tipoAusenciaId: 3,
        fechaInicio: '2026-07-12',
        fechaFin: '2026-07-12',
        numeroBoletaCcss: undefined,
        observaciones: 'Aviso por telefono',
      })
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('navega de mes manteniendo la pestaña', async () => {
    const user = userEvent.setup()
    renderQueue()

    await user.click(screen.getByLabelText('Mes siguiente'))

    expect(push).toHaveBeenCalledWith('/attendance?tab=justificar&month=2026-08-01')
  })
})
