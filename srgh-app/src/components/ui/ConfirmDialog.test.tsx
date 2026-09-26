import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'

describe('<ConfirmDialog />', () => {
  it('muestra el titulo y el mensaje', () => {
    render(
      <ConfirmDialog
        title="Eliminar horario"
        message="Esta accion no se puede deshacer."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByRole('alertdialog', { name: 'Eliminar horario' })).toBeInTheDocument()
    expect(screen.getByText('Esta accion no se puede deshacer.')).toBeInTheDocument()
  })

  it('usa "Eliminar" como texto de confirmacion por defecto', () => {
    render(<ConfirmDialog title="t" message="m" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('permite personalizar el texto de confirmacion', () => {
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmLabel="Desactivar"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
  })

  it('llama a onCancel al hacer click en Cancelar', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog title="t" message="m" onCancel={onCancel} onConfirm={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('llama a onConfirm al hacer click en el boton de confirmacion', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="t" message="m" onCancel={vi.fn()} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('<ConfirmDialog /> — teclado', () => {
  it('Escape cancela y nunca confirma', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Eliminar"
        message="¿Seguro?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('abierto sobre un Modal, Escape cierra solo la confirmación', async () => {
    const onCancel = vi.fn()
    const onCloseModal = vi.fn()
    const user = userEvent.setup()
    render(
      <>
        <Modal title="Editar" onClose={onCloseModal}>
          <p>Contenido</p>
        </Modal>
        <ConfirmDialog
          title="Eliminar"
          message="¿Seguro?"
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
      </>
    )

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCloseModal).not.toHaveBeenCalled()
  })
})
