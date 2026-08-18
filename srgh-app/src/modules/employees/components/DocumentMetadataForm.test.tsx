import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentMetadataForm } from './DocumentMetadataForm'
import { chooseSelectMenuOption } from '@/test/selectMenu'
import type { CatalogoItem } from '@/modules/employees/types'

const TIPOS: CatalogoItem[] = [
  { id: 1, nombre: 'Contrato' },
  { id: 2, nombre: 'Identificación' },
]

describe('<DocumentMetadataForm />', () => {
  it('exige nombre y tipo antes de enviar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(
      await screen.findByText(/el nombre debe tener al menos 2 caracteres/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/el tipo de documento es obligatorio/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía los valores con el tipo numérico y los opcionales vacíos como null', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/nombre del documento/i), 'Contrato firmado')
    await chooseSelectMenuOption(user, /tipo de documento/i, 'Identificación')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      doc_nombre: 'Contrato firmado',
      doc_tipo_id: 2,
      doc_descripcion: null,
      doc_fecha_vencimiento: null,
    })
  })

  it('envía descripción y vencimiento cuando se completan', async () => {
    // El calendario propio abre en el mes de "hoy" cuando el campo esta vacio:
    // se fija el reloj para que el dia buscado este a un clic, sin navegar.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2030-01-15T09:00:00'))

    const onSubmit = vi.fn()
    const user = userEvent.setup()

    try {
      render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

      await user.type(screen.getByLabelText(/nombre del documento/i), 'Contrato firmado')
      await chooseSelectMenuOption(user, /tipo de documento/i, 'Contrato')
      await user.type(screen.getByLabelText(/descripción/i), 'Firmado en enero')

      await user.click(screen.getByLabelText(/fecha de vencimiento/i))
      // La coma del inicio acota al dia 1: sin ella el patron tambien caeria
      // dentro de "11 de enero de 2030" y "21 de enero de 2030".
      await user.click(screen.getByRole('button', { name: /, 1 de enero de 2030/ }))

      await user.click(screen.getByRole('button', { name: /guardar/i }))

      // Lo que importa: el valor que sale del formulario sigue siendo el ISO.
      expect(onSubmit).toHaveBeenCalledWith({
        doc_nombre: 'Contrato firmado',
        doc_tipo_id: 1,
        doc_descripcion: 'Firmado en enero',
        doc_fecha_vencimiento: '2030-01-01',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('precarga los valores por defecto (modo edición)', () => {
    render(
      <DocumentMetadataForm
        tiposDocumento={TIPOS}
        defaultValues={{
          doc_nombre: 'Contrato viejo',
          doc_tipo_id: 2,
          doc_descripcion: 'Nota previa',
          doc_fecha_vencimiento: '2028-05-01',
        }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByLabelText(/nombre del documento/i)).toHaveValue('Contrato viejo')
    expect(screen.getByLabelText(/tipo de documento/i)).toHaveTextContent('Identificación')
    expect(screen.getByLabelText(/descripción/i)).toHaveValue('Nota previa')
    // El disparador del calendario muestra dd/mm/aaaa; el form guarda el ISO.
    expect(screen.getByLabelText(/fecha de vencimiento/i)).toHaveTextContent('01/05/2028')
  })

  it('muestra el error del servidor en un role="alert"', () => {
    render(
      <DocumentMetadataForm
        tiposDocumento={TIPOS}
        serverError="No se pudo guardar el documento."
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el documento.')
  })

  it('el botón Cancelar invoca onCancel', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={onCancel} onSubmit={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // Regresión: en el wizard este componente se monta DENTRO del <form> del
  // onboarding. Un <form> anidado es HTML inválido: React lo reporta como
  // error de hidratación y remonta el árbol, perdiendo todo lo capturado.
  it('NO renderiza un <form> (se monta dentro del form del wizard)', () => {
    const { container } = render(
      <DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={vi.fn()} />
    )

    expect(container.querySelector('form')).toBeNull()
    // Y por lo mismo, ningún botón puede ser type="submit".
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })

  it('Enter en un campo de una línea confirma, sin depender de un submit nativo', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/nombre del documento/i), 'Contrato firmado')
    await chooseSelectMenuOption(user, /tipo de documento/i, 'Contrato')
    await user.type(screen.getByLabelText(/nombre del documento/i), '{Enter}')

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  it('Enter dentro del textarea NO confirma (es un salto de línea legítimo)', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<DocumentMetadataForm tiposDocumento={TIPOS} onCancel={vi.fn()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/nombre del documento/i), 'Contrato firmado')
    await chooseSelectMenuOption(user, /tipo de documento/i, 'Contrato')
    await user.type(screen.getByLabelText(/descripción/i), 'linea 1{Enter}linea 2')

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/descripción/i)).toHaveValue('linea 1\nlinea 2')
  })
})
