import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePickerButton } from './DatePickerButton'

function abrir() {
  return userEvent.click(screen.getByRole('button', { name: 'Elegir fecha' }))
}

function calendario() {
  return within(screen.getByRole('dialog', { name: 'Elegir fecha' }))
}

describe('<DatePickerButton />', () => {
  it('empieza cerrado', () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('abre en el mes de la fecha seleccionada', async () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    await abrir()

    expect(calendario().getByText('Agosto de 2026')).toBeInTheDocument()
  })

  it('devuelve la fecha elegida en formato ISO', async () => {
    const onChange = vi.fn()
    render(<DatePickerButton value="2026-08-15" onChange={onChange} />)
    await abrir()

    await userEvent.click(calendario().getByRole('button', { name: /22 de agosto de 2026/ }))

    expect(onChange).toHaveBeenCalledWith('2026-08-22')
  })

  it('se cierra despues de elegir', async () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    await abrir()
    await userEvent.click(calendario().getByRole('button', { name: /22 de agosto de 2026/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra solo los dias del mes en curso, sin relleno de meses vecinos', async () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    await abrir()

    const dias = calendario()
      .getAllByRole('button')
      .filter((b) => /^\d+$/.test(b.textContent ?? ''))

    expect(dias).toHaveLength(31) // agosto
  })

  it('navega entre meses sin cambiar la fecha seleccionada', async () => {
    const onChange = vi.fn()
    render(<DatePickerButton value="2026-08-15" onChange={onChange} />)
    await abrir()

    await userEvent.click(calendario().getByRole('button', { name: 'Mes siguiente' }))

    expect(calendario().getByText('Septiembre de 2026')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('al pasar a un mes mas corto recorta el dia en vez de saltarse el mes', async () => {
    // 31 de enero + 1 mes no existe en febrero: debe quedarse en febrero.
    render(<DatePickerButton value="2026-01-31" onChange={vi.fn()} />)
    await abrir()

    await userEvent.click(calendario().getByRole('button', { name: 'Mes siguiente' }))

    expect(calendario().getByText('Febrero de 2026')).toBeInTheDocument()
  })

  it('las flechas mueven el dia activo y cruzan de mes', async () => {
    render(<DatePickerButton value="2026-08-31" onChange={vi.fn()} />)
    await abrir()

    await userEvent.keyboard('{ArrowRight}')

    // 31 de agosto + 1 dia cae en septiembre.
    expect(calendario().getByText('Septiembre de 2026')).toBeInTheDocument()
  })

  it('marca la fecha elegida con aria-current, no el dia de hoy', async () => {
    render(<DatePickerButton value="2026-08-15" todayISO="2026-08-20" onChange={vi.fn()} />)
    await abrir()

    const actual = calendario().getByRole('button', { name: /15 de agosto de 2026/ })
    expect(actual).toHaveAttribute('aria-current', 'date')

    const hoy = calendario().getByRole('button', { name: /20 de agosto de 2026, hoy/ })
    expect(hoy).not.toHaveAttribute('aria-current')
  })

  it('el boton "Hoy" solo aparece si se le dijo cual es hoy', async () => {
    const { rerender } = render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    await abrir()
    expect(calendario().queryByRole('button', { name: 'Hoy' })).not.toBeInTheDocument()

    rerender(<DatePickerButton value="2026-08-15" todayISO="2026-08-20" onChange={vi.fn()} />)
    expect(calendario().getByRole('button', { name: 'Hoy' })).toBeInTheDocument()
  })

  it('"Hoy" salta a la fecha de negocio, no a la del navegador', async () => {
    const onChange = vi.fn()
    render(<DatePickerButton value="2026-08-15" todayISO="2026-08-20" onChange={onChange} />)
    await abrir()

    await userEvent.click(calendario().getByRole('button', { name: 'Hoy' }))

    expect(onChange).toHaveBeenCalledWith('2026-08-20')
  })

  it('Escape cierra y devuelve el foco al boton', async () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} />)
    const boton = screen.getByRole('button', { name: 'Elegir fecha' })
    await abrir()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
  })

  it('no abre cuando esta deshabilitado', async () => {
    render(<DatePickerButton value="2026-08-15" onChange={vi.fn()} disabled />)

    await userEvent.click(screen.getByRole('button', { name: 'Elegir fecha' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
