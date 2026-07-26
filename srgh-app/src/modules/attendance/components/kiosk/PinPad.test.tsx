import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinPad } from './PinPad'

describe('<PinPad />', () => {
  it('llama onConfirm con los 4 digitos ingresados', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PinPad onConfirm={onConfirm} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '0' }))

    expect(onConfirm).toHaveBeenCalledWith('1990')
  })

  it('no llama onConfirm antes de completar los 4 digitos', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PinPad onConfirm={onConfirm} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '9' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('el boton de borrar quita el ultimo digito', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PinPad onConfirm={onConfirm} onCancel={vi.fn()} />)

    // Escribe "198", borra el "8", y completa "9" y "0" -> queda "1990".
    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: 'Borrar' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '0' }))

    expect(onConfirm).toHaveBeenCalledWith('1990')
  })

  it('llama onCancel al cerrar', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<PinPad onConfirm={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
