import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormatoHoraProvider } from '@/lib/time/FormatoHoraContext'
import { saveManualMark } from '@/modules/attendance/actions/saveManualMark'
import type {
  DailyAttendanceRow,
  DailyScheduledBlock,
} from '@/modules/attendance/actions/getDailyAttendance'
import { DailyAttendanceTable } from './DailyAttendanceTable'

vi.mock('@/modules/attendance/actions/saveManualMark', () => ({ saveManualMark: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/attendance',
  useRouter: () => ({ push: vi.fn() }),
}))

function makeRow(overrides: Partial<DailyAttendanceRow> = {}): DailyAttendanceRow {
  return {
    status: { kind: 'en_jornada', tardiness: null, needsAttention: false },
    employmentHistoryId: 1,
    employeeId: 10,
    fullName: 'Ana Pérez',
    fotoUrl: null,
    position: 'Cajera',
    branchId: 100,
    isDayOff: false,
    isHoliday: false,
    ausencia: null,
    expectedStart: '08:02',
    entrada: { id: 1, time: '08:04', diffMinutes: 2 },
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    blocks: [],
    scheduledBlocks: [],
    isSecondBlockJustified: false,
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

const morning: DailyScheduledBlock = {
  inicio: '08:00',
  fin: '12:00',
  branchId: 100,
  branchName: 'Centro',
  entrada: { id: 1, time: '08:04', diffMinutes: 4 },
  salida: { id: 2, time: '12:00', diffMinutes: null },
}
const evening: DailyScheduledBlock = {
  inicio: '18:00',
  fin: '23:00',
  branchId: 200,
  branchName: 'Norte',
  entrada: null,
  salida: null,
}

function renderMobile(row: DailyAttendanceRow, canWrite = true) {
  render(
    <FormatoHoraProvider formato="12h">
      <DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite={canWrite} />
    </FormatoHoraProvider>
  )
  return within(screen.getByRole('listitem'))
}

describe('DailyPersonRow in the mobile diary', () => {
  it('shows the name, position, state and latest mark', () => {
    const row = renderMobile(
      makeRow({
        status: { kind: 'ya_salio', tardiness: null, needsAttention: false },
        salida: { id: 4, time: '17:00', diffMinutes: null },
      })
    )

    expect(row.getByText('Ana Pérez')).toBeInTheDocument()
    expect(row.getByText('Cajera')).toBeInTheDocument()
    expect(row.getByText('Ya salió')).toBeInTheDocument()
    expect(row.getByText(/Salió 5:00 p\.\s*m\./)).toBeInTheDocument()
    expect(row.queryByRole('button', { name: /^Agregar/ })).not.toBeInTheDocument()
  })

  it('shows the latest break mark when it comes after the entry', () => {
    const row = renderMobile(makeRow({ finReceso: { id: 2, time: '10:15', diffMinutes: null } }))

    expect(row.getByText(/Volvió del receso 10:15/)).toBeInTheDocument()
  })

  it('adds an entry at the expected time without expanding the row', async () => {
    const row = renderMobile(
      makeRow({
        status: { kind: 'por_llegar', tardiness: null, needsAttention: false },
        entrada: null,
      })
    )

    expect(row.getByText(/Entra 8:02 a\.\s*m\./)).toBeInTheDocument()
    await userEvent.click(row.getByRole('button', { name: 'Agregar entrada' }))
    expect(row.getByRole('button', { name: 'Detalle de Ana Pérez' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    const dialog = within(screen.getByRole('dialog', { name: 'Agregar marca' }))
    expect(dialog.getByText('Ana Pérez — Entrada')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Hora real del evento: hora' })).toHaveTextContent(
      '8'
    )
    expect(dialog.getByRole('button', { name: 'Hora real del evento: minutos' })).toHaveTextContent(
      '02'
    )
  })

  it('adds an exit using the expected end of the open second block', async () => {
    vi.mocked(saveManualMark).mockResolvedValue({ ok: true })
    const row = renderMobile(
      makeRow({
        scheduledBlocks: [
          morning,
          { ...evening, entrada: { id: 3, time: '18:01', diffMinutes: 1 } },
        ],
        status: { kind: 'sin_salida', tardiness: null, needsAttention: true },
      })
    )

    expect(row.getByText(/Entró 6:01 p\.\s*m\./)).toBeInTheDocument()
    await userEvent.click(row.getByRole('button', { name: 'Agregar salida' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Agregar marca' }))
    expect(dialog.getByText('Ana Pérez — Salida')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Hora real del evento: hora' })).toHaveTextContent(
      '11'
    )
    expect(
      dialog.getByRole('button', { name: 'Hora real del evento: a. m. o p. m.' })
    ).toHaveTextContent(/p\.\s*m\./)
    await userEvent.type(
      dialog.getByLabelText('Justificación (obligatoria)'),
      'Olvidó marcar la salida'
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Agregar marca' }))
    expect(saveManualMark).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'salida', sucursalId: 200, hora: '23:00', markId: null })
    )
  })

  it('expands the marks and the second block when tapping the summary', async () => {
    const row = renderMobile(makeRow({ scheduledBlocks: [morning, evening] }))
    const toggle = row.getByRole('button', { name: 'Detalle de Ana Pérez' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(row.queryByText('2.º bloque')).not.toBeInTheDocument()

    await userEvent.click(row.getByText('Ana Pérez'))

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const details = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(details).toBeVisible()
    expect(within(details).getByText('2.º bloque')).toBeInTheDocument()
    expect(
      within(details).getByRole('button', { name: 'Agregar marca de entrada del 2.º bloque' })
    ).toBeInTheDocument()
    expect(within(details).getByText('Inicio receso')).toBeInTheDocument()
  })

  it('allows expansion with read-only access and hides the mark actions', async () => {
    const row = renderMobile(makeRow(), false)
    expect(row.queryByRole('button', { name: 'Agregar salida' })).not.toBeInTheDocument()

    await userEvent.click(row.getByRole('button', { name: 'Detalle de Ana Pérez' }))
    expect(row.getByText('Entrada')).toBeInTheDocument()
    expect(row.getAllByRole('button')).toHaveLength(1)
  })
})
