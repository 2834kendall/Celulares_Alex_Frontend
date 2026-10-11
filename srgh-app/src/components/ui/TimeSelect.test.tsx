import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeSelect, toHour12, toHour24 } from './TimeSelect'
import { FormatoHoraProvider } from '@/lib/time/FormatoHoraContext'
import type { FormatoHora } from '@/lib/time/formatoHora'
import { chooseSelectMenuOption } from '@/test/selectMenu'

function renderTimeSelect(value: string, formato: FormatoHora, onChange = vi.fn()) {
  render(
    <FormatoHoraProvider formato={formato}>
      <TimeSelect label="Entrada" value={value} onChange={onChange} />
    </FormatoHoraProvider>
  )
  return onChange
}

describe('conversiones 12h ↔ 24h', () => {
  it('toHour12: medianoche es 12 y la tarde resta 12', () => {
    expect(toHour12(0)).toBe(12)
    expect(toHour12(9)).toBe(9)
    expect(toHour12(12)).toBe(12)
    expect(toHour12(21)).toBe(9)
  })

  it('toHour24: 12 a. m. es medianoche y 12 p. m. mediodia', () => {
    expect(toHour24(12, 'AM')).toBe(0)
    expect(toHour24(9, 'AM')).toBe(9)
    expect(toHour24(12, 'PM')).toBe(12)
    expect(toHour24(9, 'PM')).toBe(21)
  })
})

describe('<TimeSelect /> en 24h', () => {
  it('muestra la hora de 00 a 23 y no ofrece a. m./p. m.', () => {
    renderTimeSelect('13:05', '24h')
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('13')
    expect(screen.getByLabelText('Entrada: minutos')).toHaveTextContent('05')
    expect(screen.queryByLabelText('Entrada: a. m. o p. m.')).not.toBeInTheDocument()
  })

  it('funciona fuera del proveedor (default 24h)', () => {
    render(<TimeSelect label="Entrada" value="08:00" onChange={vi.fn()} />)
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('08')
    expect(screen.queryByLabelText('Entrada: a. m. o p. m.')).not.toBeInTheDocument()
  })

  it('cambiar la hora conserva los minutos', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('09:15', '24h')
    await chooseSelectMenuOption(user, 'Entrada: hora', '17')
    expect(onChange).toHaveBeenCalledWith('17:15')
  })

  it('cambiar los minutos conserva la hora (precision de minuto)', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('09:15', '24h')
    await chooseSelectMenuOption(user, 'Entrada: minutos', '07')
    expect(onChange).toHaveBeenCalledWith('09:07')
  })

  it('escribir un numero salta a esa opcion (typeahead)', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('09:15', '24h')
    screen.getByLabelText('Entrada: minutos').focus()
    await user.keyboard('42{Enter}')
    expect(onChange).toHaveBeenCalledWith('09:42')
  })
})

describe('<TimeSelect /> en 12h', () => {
  it('muestra la hora de 1 a 12 con a. m. antes del mediodia', () => {
    renderTimeSelect('09:15', '12h')
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('9')
    expect(screen.getByLabelText('Entrada: a. m. o p. m.')).toHaveTextContent('a. m.')
  })

  it('muestra p. m. del mediodia en adelante', () => {
    renderTimeSelect('13:15', '12h')
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('1')
    expect(screen.getByLabelText('Entrada: a. m. o p. m.')).toHaveTextContent('p. m.')
  })

  it('medianoche se muestra como 12 a. m.', () => {
    renderTimeSelect('00:30', '12h')
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('12')
    expect(screen.getByLabelText('Entrada: a. m. o p. m.')).toHaveTextContent('a. m.')
  })

  it('elegir una hora en p. m. devuelve 24h', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('13:15', '12h')
    await chooseSelectMenuOption(user, 'Entrada: hora', '5')
    expect(onChange).toHaveBeenCalledWith('17:15')
  })

  it('convierte a 24h al cambiar a p. m.', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('09:15', '12h')
    await chooseSelectMenuOption(user, 'Entrada: a. m. o p. m.', 'p. m.')
    expect(onChange).toHaveBeenCalledWith('21:15')
  })

  it('convierte a 24h al cambiar a a. m.', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('13:15', '12h')
    await chooseSelectMenuOption(user, 'Entrada: a. m. o p. m.', 'a. m.')
    expect(onChange).toHaveBeenCalledWith('01:15')
  })

  it('el mediodia (12:00) al cambiar a a. m. se convierte en medianoche', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('12:00', '12h')
    await chooseSelectMenuOption(user, 'Entrada: a. m. o p. m.', 'a. m.')
    expect(onChange).toHaveBeenCalledWith('00:00')
  })
})

describe('<TimeSelect /> con valor vacio', () => {
  it('muestra "--" y completa con :00 al elegir solo la hora', async () => {
    const user = userEvent.setup()
    const onChange = renderTimeSelect('', '24h')
    expect(screen.getByLabelText('Entrada: hora')).toHaveTextContent('--')
    await chooseSelectMenuOption(user, 'Entrada: hora', '10')
    expect(onChange).toHaveBeenCalledWith('10:00')
  })
})
