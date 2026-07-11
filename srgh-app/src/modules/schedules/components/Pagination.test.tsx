import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

describe('<Pagination />', () => {
  it('no renderiza nada cuando solo hay una pagina', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPrevious={vi.fn()} onNext={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el numero de pagina actual y el total', () => {
    render(<Pagination page={2} totalPages={5} onPrevious={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByText('Página 2 de 5')).toBeInTheDocument()
  })

  it('deshabilita "anterior" en la primera pagina y "siguiente" en la ultima', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} onPrevious={vi.fn()} onNext={vi.fn()} />
    )
    expect(screen.getByLabelText('Página anterior')).toBeDisabled()
    expect(screen.getByLabelText('Página siguiente')).toBeEnabled()

    rerender(<Pagination page={3} totalPages={3} onPrevious={vi.fn()} onNext={vi.fn()} />)
    expect(screen.getByLabelText('Página anterior')).toBeEnabled()
    expect(screen.getByLabelText('Página siguiente')).toBeDisabled()
  })

  it('llama a onPrevious y onNext al hacer click', async () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(<Pagination page={2} totalPages={3} onPrevious={onPrevious} onNext={onNext} />)

    await userEvent.click(screen.getByLabelText('Página anterior'))
    await userEvent.click(screen.getByLabelText('Página siguiente'))

    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
