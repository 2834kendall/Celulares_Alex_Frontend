import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsavedChangesProvider } from './UnsavedChangesProvider'
import { Modal } from './Modal'
import { useForm } from '@/hooks/useProtectedForm'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

const navigation = vi.hoisted(() => ({
  options: null as null | {
    enabled: (p: { type: string }) => boolean
    confirm: () => Promise<boolean>
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('nextjs-nav-guard', () => ({
  NavigationGuardProvider: ({ children }: { children: React.ReactNode }) => children,
  useNavigationGuard: (options: typeof navigation.options) => {
    navigation.options = options
  },
}))

function Form({ close, busy = false }: { close: () => void; busy?: boolean }) {
  const { register, guard } = useForm({
    unsavedLabel: 'la sucursal',
    defaultValues: { name: 'Centro' },
    unsavedBusy: busy,
  })
  return (
    <Modal title="Editar sucursal" onClose={close}>
      <form ref={(element) => guard.bindRoot(element)}>
        <input aria-label="Nombre" {...register('name')} />
        <button type="button" onClick={() => guard.confirmLeave(close)}>
          Cancelar edición
        </button>
        <button type="button" onClick={() => guard.acceptChanges()}>
          Simular guardado confirmado
        </button>
        <button type="button">Simular error de servidor</button>
      </form>
    </Modal>
  )
}
function setup(busy = false) {
  const close = vi.fn()
  render(
    <UnsavedChangesProvider>
      <Form close={close} busy={busy} />
    </UnsavedChangesProvider>
  )
  return { close, user: userEvent.setup() }
}

describe('unsaved changes decisions', () => {
  beforeEach(() => {
    navigation.options = null
  })
  it('protects a file selected before metadata mounts, even without typing', async () => {
    const close = vi.fn()
    function PendingDocument() {
      const { register, guard } = useForm({
        unsavedLabel: 'los datos del documento',
        defaultValues: { name: 'Contrato' },
        unsavedExtra: new File(['demo'], 'contrato.pdf'),
        unsavedHasFiles: true,
      })
      return (
        <Modal title="Documento" onClose={close}>
          <div ref={(element) => guard.bindRoot(element)}>
            <input aria-label="Documento" {...register('name')} />
          </div>
        </Modal>
      )
    }
    render(
      <UnsavedChangesProvider>
        <PendingDocument />
      </UnsavedChangesProvider>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/tendrás que seleccionarlos/)).toBeInTheDocument()
  })
  it('does not interrupt an untouched form or a reverted edit', async () => {
    const { close, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(close).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Centro')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(close).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('keeps the safe choice primary and preserves input when staying or pressing Escape', async () => {
    const { close, user } = setup()
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    const stay = screen.getByRole('button', { name: 'Seguir editando' })
    expect(stay).toHaveFocus()
    expect(stay).toHaveClass('bg-brand-action')
    expect(screen.getByRole('button', { name: 'Salir sin guardar' })).toHaveClass('bg-white')
    await user.keyboard('{Escape}')
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Centro nuevo')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Centro nuevo')
  })
  it('uses the same decision on backdrop and discards exactly once', async () => {
    const { close, user } = setup()
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    await user.click(screen.getByRole('dialog'))
    expect(close).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('keeps failed edits protected and clears only after confirmed persistence', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    await user.click(screen.getByRole('button', { name: 'Simular error de servidor' }))
    let event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Simular guardado confirmado' }))
    event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    await user.type(screen.getByLabelText('Nombre'), ' otra')
    expect(navigation.options?.enabled({ type: 'push' })).toBe(true)
  })
  it('blocks cancellation while a changed form is saving', async () => {
    const { user, close } = setup(true)
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
    expect(close).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
  it('settles an asynchronous browser/router decision on stay and discard', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('Nombre'), ' nuevo')
    let result!: Promise<boolean>
    act(() => {
      result = navigation.options!.confirm()
    })
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(await result).toBe(false)
    act(() => {
      result = navigation.options!.confirm()
    })
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(await result).toBe(true)
  })
  it('preserves a selected file when staying and clears the warning when removed', async () => {
    function Attachment() {
      const [file, setFile] = useState<File | null>(null)
      const guard = useUnsavedChanges({
        label: 'el documento',
        value: file,
        hasFiles: Boolean(file),
      })
      return (
        <Modal title="Documento" onClose={vi.fn()}>
          <div ref={(element) => guard.bindRoot(element)}>
            <input
              type="file"
              aria-label="Archivo"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button onClick={() => setFile(null)}>Quitar selección</button>
          </div>
        </Modal>
      )
    }
    render(
      <UnsavedChangesProvider>
        <Attachment />
      </UnsavedChangesProvider>
    )
    const user = userEvent.setup()
    const file = new File(['demo'], 'documento.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Archivo'), file)
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByText(/tendrás que seleccionarlos/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect((screen.getByLabelText('Archivo') as HTMLInputElement).files?.[0]).toBe(file)
    await user.click(screen.getByRole('button', { name: 'Quitar selección' }))
    await waitFor(() => expect(navigation.options?.enabled({ type: 'push' })).toBe(false))
  })
  it('does not clear a different form when closing a clean modal', async () => {
    const close = vi.fn()
    function Outside() {
      const [value, setValue] = useState('')
      const guard = useUnsavedChanges({ label: 'la página', value })
      return (
        <input
          ref={(element) => guard.bindRoot(element)}
          aria-label="Fuera"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    }
    render(
      <UnsavedChangesProvider>
        <Outside />
        <Modal title="Información" onClose={close}>
          <p>Detalle</p>
        </Modal>
      </UnsavedChangesProvider>
    )
    fireEvent.change(screen.getByLabelText('Fuera'), { target: { value: 'cambio' } })
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(navigation.options?.enabled({ type: 'push' })).toBe(true)
  })
})
