import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { setMarcaPreview } from '@/modules/settings/actions/setMarcaPreview'
import { MarcaPreviewBanner, MarcaSwitcher } from './MarcaSwitcher'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/modules/settings/actions/setMarcaPreview', () => ({ setMarcaPreview: vi.fn() }))

const MARCAS = [
  { id: 1, nombre: 'Celulares Alex', colorAcento: null, colorSidebar: null, logoPath: null },
  { id: 2, nombre: 'Infinity', colorAcento: null, colorSidebar: null, logoPath: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(setMarcaPreview).mockResolvedValue({ ok: true })
})

describe('MarcaSwitcher', () => {
  it('se presenta como una vista previa del tema, no como un filtro de marca', () => {
    render(<MarcaSwitcher marcas={MARCAS} marcaPreviewId={null} />)
    expect(screen.getByRole('button', { name: 'Vista previa del tema' })).toHaveTextContent(
      'Sin vista previa'
    )
  })

  it('sin marcas no se muestra', () => {
    render(<MarcaSwitcher marcas={[]} marcaPreviewId={null} />)
    expect(screen.queryByRole('button', { name: 'Vista previa del tema' })).not.toBeInTheDocument()
  })

  it('elegir una marca fija la vista previa y refresca', async () => {
    render(<MarcaSwitcher marcas={MARCAS} marcaPreviewId={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa del tema' }))
    await userEvent.click(screen.getByRole('button', { name: 'Infinity' }))

    await waitFor(() => expect(setMarcaPreview).toHaveBeenCalledWith(2))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('si falla, muestra el error y no refresca', async () => {
    vi.mocked(setMarcaPreview).mockResolvedValue({ ok: false, error: 'Esa marca no existe.' })
    render(<MarcaSwitcher marcas={MARCAS} marcaPreviewId={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa del tema' }))
    await userEvent.click(screen.getByRole('button', { name: 'Infinity' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esa marca no existe.'))
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('MarcaPreviewBanner', () => {
  it('avisa que los datos no cambian', () => {
    render(<MarcaPreviewBanner marcaNombre="Infinity" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Estás viendo el tema de Infinity. Los datos siguen siendo de todas las marcas.'
    )
  })

  it('permite salir de la vista previa', async () => {
    render(<MarcaPreviewBanner marcaNombre="Infinity" />)
    await userEvent.click(screen.getByRole('button', { name: 'Salir de la vista previa' }))

    await waitFor(() => expect(setMarcaPreview).toHaveBeenCalledWith(null))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
