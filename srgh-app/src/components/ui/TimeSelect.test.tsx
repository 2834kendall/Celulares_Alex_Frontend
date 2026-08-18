import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeSelect } from './TimeSelect'

describe('<TimeSelect />', () => {
  it('muestra "a.m." cuando la hora es antes del mediodia', () => {
    render(<TimeSelect value="09:15" onChange={vi.fn()} />)
    expect(screen.getByLabelText('a.m. o p.m.')).toHaveValue('AM')
  })

  it('muestra "p.m." cuando la hora es del mediodia en adelante', () => {
    render(<TimeSelect value="13:15" onChange={vi.fn()} />)
    expect(screen.getByLabelText('a.m. o p.m.')).toHaveValue('PM')
  })

  it('notifica el nuevo valor al cambiar el input de hora', () => {
    const onChange = vi.fn()
    render(<TimeSelect value="09:15" onChange={onChange} />)

    const input = screen.getByDisplayValue('09:15')
    fireEvent.change(input, { target: { value: '10:30' } })

    expect(onChange).toHaveBeenCalledWith('10:30')
  })

  it('convierte a formato 24h al cambiar a p.m.', async () => {
    const onChange = vi.fn()
    render(<TimeSelect value="09:15" onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('a.m. o p.m.'), 'PM')

    expect(onChange).toHaveBeenCalledWith('21:15')
  })

  it('convierte a formato 24h al cambiar a a.m.', async () => {
    const onChange = vi.fn()
    render(<TimeSelect value="13:15" onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('a.m. o p.m.'), 'AM')

    expect(onChange).toHaveBeenCalledWith('01:15')
  })

  it('el mediodia (12:00) al cambiar a a.m. se convierte en medianoche', async () => {
    const onChange = vi.fn()
    render(<TimeSelect value="12:00" onChange={onChange} />)

    await userEvent.selectOptions(screen.getByLabelText('a.m. o p.m.'), 'AM')

    expect(onChange).toHaveBeenCalledWith('00:00')
  })
})
