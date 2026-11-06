import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardBoard } from './DashboardBoard'
import { PANEL_BY_ID, type PanelId, type PanelSize, type ResolvedPanel } from '../lib/panels'
import { saveDashboardPrefs } from '../lib/savePrefs'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../lib/savePrefs', () => ({ saveDashboardPrefs: vi.fn() }))
const panel = (
  id: PanelId,
  hidden = false,
  size: PanelSize = PANEL_BY_ID[id].defaultSize
): ResolvedPanel => ({ ...PANEL_BY_ID[id], hidden, size })
const nodes = {
  attendance: (
    <section>
      <h2>Attendance content</h2>
    </section>
  ),
  birthdays: (
    <section>
      <h2>Birthday content</h2>
    </section>
  ),
  payroll: (
    <section>
      <h2>Payroll content</h2>
    </section>
  ),
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(saveDashboardPrefs).mockResolvedValue({ ok: true })
})
async function edit() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Personalizar' }))
  return user
}

describe('dashboard personalization interactions', () => {
  it('renders nothing without permitted panels', () => {
    const { container } = render(<DashboardBoard panels={[]} nodes={{}} />)
    expect(container).toBeEmptyDOMElement()
    expect(saveDashboardPrefs).not.toHaveBeenCalled()
  })
  it('entering and leaving personalization does not save or refresh anything', async () => {
    render(<DashboardBoard panels={[panel('attendance')]} nodes={nodes} />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    const user = await edit()
    expect(
      screen.getByRole('toolbar', { name: 'Controles de Asistencia de hoy' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(saveDashboardPrefs).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('hides and restores a loaded panel without another server render', async () => {
    render(<DashboardBoard panels={[panel('attendance'), panel('birthdays')]} nodes={nodes} />)
    const user = await edit()
    await user.click(screen.getByRole('button', { name: 'Ocultar Cumpleaños' }))
    await waitFor(() =>
      expect(saveDashboardPrefs).toHaveBeenLastCalledWith({
        order: ['attendance', 'birthdays'],
        hidden: ['birthdays'],
        sizes: {},
      })
    )
    expect(screen.queryByText('Birthday content')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cumpleaños' }))
    expect(screen.getByText('Birthday content')).toBeInTheDocument()
    expect(saveDashboardPrefs).toHaveBeenLastCalledWith({
      order: ['attendance', 'birthdays'],
      hidden: [],
      sizes: {},
    })
    expect(refresh).not.toHaveBeenCalled()
  })
  it('requests missing panel data only after a successful preference save', async () => {
    let finish!: (result: { ok: true }) => void
    vi.mocked(saveDashboardPrefs).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(
      <DashboardBoard
        panels={[panel('attendance'), panel('birthdays', true)]}
        nodes={{ attendance: nodes.attendance }}
      />
    )
    const user = await edit()
    await user.click(screen.getByRole('button', { name: 'Cumpleaños' }))
    expect(screen.getByText('Cargando cumpleaños…')).toHaveAttribute('aria-busy', 'true')
    expect(refresh).not.toHaveBeenCalled()
    finish({ ok: true })
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })
  it('shows failed persistence without refreshing and clears the error on a later successful change', async () => {
    vi.mocked(saveDashboardPrefs)
      .mockResolvedValueOnce({ ok: false, error: 'No se pudo guardar.' })
      .mockResolvedValue({ ok: true })
    render(
      <DashboardBoard
        panels={[panel('attendance'), panel('birthdays', true)]}
        nodes={{ attendance: nodes.attendance }}
      />
    )
    const user = await edit()
    await user.click(screen.getByRole('button', { name: 'Cumpleaños' }))
    expect(await screen.findByText('No se pudo guardar.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Ocultar Cumpleaños' }))
    await waitFor(() => expect(screen.queryByText('No se pudo guardar.')).not.toBeInTheDocument())
    expect(saveDashboardPrefs).toHaveBeenCalledTimes(2)
  })
  it('moves between visible neighbors rather than an invisible hidden panel', async () => {
    const { container } = render(
      <DashboardBoard
        panels={[panel('attendance'), panel('birthdays', true), panel('payroll')]}
        nodes={nodes}
      />
    )
    const user = await edit()
    await user.click(screen.getByRole('button', { name: 'Mover Asistencia de hoy después' }))
    expect(Array.from(container.querySelectorAll('h2'), (node) => node.textContent)).toEqual([
      'Payroll content',
      'Attendance content',
    ])
    expect(saveDashboardPrefs).toHaveBeenLastCalledWith({
      order: ['birthdays', 'payroll', 'attendance'],
      hidden: ['birthdays'],
      sizes: {},
    })
    expect(screen.getByRole('button', { name: 'Mover Asistencia de hoy después' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover Nómina antes' })).toBeDisabled()
  })
  it('bounds width changes to supported sizes', async () => {
    render(<DashboardBoard panels={[panel('attendance', false, 2)]} nodes={nodes} />)
    const user = await edit()
    expect(
      screen.getByRole('button', { name: 'Hacer Asistencia de hoy más angosto' })
    ).toBeDisabled()
    const wider = screen.getByRole('button', { name: 'Hacer Asistencia de hoy más ancho' })
    await user.click(wider)
    await user.click(wider)
    await user.click(wider)
    expect(wider).toBeDisabled()
    expect(saveDashboardPrefs).toHaveBeenLastCalledWith({
      order: ['attendance'],
      hidden: [],
      sizes: { attendance: 6 },
    })
  })
  it('restores registry order, default visibility and default sizes', async () => {
    render(
      <DashboardBoard
        panels={[panel('payroll'), panel('birthdays', true), panel('attendance', false, 6)]}
        nodes={nodes}
      />
    )
    const user = await edit()
    await user.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(saveDashboardPrefs).toHaveBeenLastCalledWith({
      order: ['attendance', 'birthdays', 'payroll'],
      hidden: [],
      sizes: {},
    })
    expect(screen.queryByRole('button', { name: 'Restablecer' })).not.toBeInTheDocument()
  })
  it('adopts a new saved server arrangement without sending it back as a new edit', async () => {
    const view = render(<DashboardBoard panels={[panel('attendance')]} nodes={nodes} />)
    view.rerender(<DashboardBoard panels={[panel('birthdays')]} nodes={nodes} />)
    expect(screen.getByText('Birthday content')).toBeInTheDocument()
    expect(screen.queryByText('Attendance content')).not.toBeInTheDocument()
    expect(saveDashboardPrefs).not.toHaveBeenCalled()
  })
  it('dragging updates the preview but saves only when the drag finishes', async () => {
    render(<DashboardBoard panels={[panel('attendance'), panel('payroll')]} nodes={nodes} />)
    await edit()
    const first = screen.getByText('Attendance content').closest('[draggable=true]')!
    const second = screen.getByText('Payroll content').closest('[draggable=true]')!
    fireEvent.dragStart(first, { dataTransfer: { effectAllowed: 'none' } })
    fireEvent.dragEnter(second)
    expect(saveDashboardPrefs).not.toHaveBeenCalled()
    fireEvent.dragEnd(first)
    await waitFor(() => expect(saveDashboardPrefs).toHaveBeenCalledOnce())
    expect(saveDashboardPrefs).toHaveBeenCalledWith({
      order: ['payroll', 'attendance'],
      hidden: [],
      sizes: {},
    })
  })
})
