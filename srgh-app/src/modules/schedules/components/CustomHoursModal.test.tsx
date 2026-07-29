import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomHoursModal } from './CustomHoursModal'

const WEEK_DATES = [
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
  '2026-01-10',
  '2026-01-11',
]

const baseProps = {
  employeeName: 'Ana Perez',
  dayLabel: 'Lunes 05 ene.',
  weekDates: WEEK_DATES,
  initialDate: '2026-01-05',
  initialStartTime: '08:00',
  initialEndTime: '17:00',
  onClose: vi.fn(),
  onConfirm: vi.fn(),
}

describe('<CustomHoursModal />', () => {
  it('muestra el nombre del colaborador y el dia', () => {
    render(<CustomHoursModal {...baseProps} />)

    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.getByText('Lunes 05 ene.')).toBeInTheDocument()
  })

  it('almuerzo y break inician deshabilitados si no hay valores iniciales', () => {
    render(<CustomHoursModal {...baseProps} />)

    expect(screen.getByLabelText('Incluye almuerzo')).not.toBeChecked()
    expect(screen.getByLabelText('Incluye break')).not.toBeChecked()
  })

  it('el toggle de almuerzo revela los selectores de hora al activarse', async () => {
    render(<CustomHoursModal {...baseProps} />)

    await userEvent.click(screen.getByText('Incluye almuerzo'))

    expect(screen.getByLabelText('Incluye almuerzo')).toBeChecked()
  })

  it('llama a onClose al cancelar', async () => {
    const onClose = vi.fn()
    render(<CustomHoursModal {...baseProps} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('envia startTime/endTime y null para almuerzo/break no activados', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<CustomHoursModal {...baseProps} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onConfirm).toHaveBeenCalledWith({
      startTime: '08:00',
      endTime: '17:00',
      lunchStart: null,
      lunchEnd: null,
      breakStart: null,
      breakEnd: null,
      applyToDates: ['2026-01-05'],
    })
  })

  it('envia los valores de almuerzo cuando el periodo esta activado', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <CustomHoursModal
        {...baseProps}
        initialLunchStart="12:00"
        initialLunchEnd="13:00"
        onConfirm={onConfirm}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ lunchStart: '12:00', lunchEnd: '13:00' })
    )
  })

  it('muestra "Guardando..." mientras onConfirm esta pendiente', async () => {
    let resolveConfirm!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        })
    )
    render(<CustomHoursModal {...baseProps} onConfirm={onConfirm} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveConfirm()
  })
})
