import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopbarBrand } from './TopbarBrand'

const EMPRESA = 'TecnoCel'

function renderBrand(props: { collapsed?: boolean; canCollapse?: boolean; onToggle?: () => void }) {
  return render(
    <TopbarBrand
      collapsed={props.collapsed ?? false}
      canCollapse={props.canCollapse ?? true}
      onToggle={props.onToggle ?? vi.fn()}
      logoUrl={null}
      empresaNombre={EMPRESA}
      sucursalNombre="PZ2"
    />
  )
}

/** El AppShell real: el estado vive afuera y TopbarBrand solo lo alterna. */
function StatefulBrand() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <TopbarBrand
      collapsed={collapsed}
      canCollapse
      onToggle={() => setCollapsed((v) => !v)}
      logoUrl={null}
      empresaNombre={EMPRESA}
      sucursalNombre="PZ2"
    />
  )
}

describe('TopbarBrand', () => {
  it('expandido muestra la identidad y el botón de contraer', () => {
    renderBrand({})

    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    expect(screen.getByText('PZ2')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Contraer menú lateral' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'app-sidebar')
  })

  it('colapsado el logo es el botón de expandir', () => {
    renderBrand({ collapsed: true })

    const button = screen.getByRole('button', { name: 'Expandir menú lateral' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'app-sidebar')
    // Sin nombre ni sucursal: en 76px solo entra el logo (la inicial).
    expect(screen.queryByText(EMPRESA)).not.toBeInTheDocument()
    expect(button).toHaveTextContent(EMPRESA.charAt(0))
  })

  it('canCollapse=false no ofrece el botón (modo configuración)', () => {
    renderBrand({ canCollapse: false })

    expect(screen.getByText(EMPRESA)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('el botón llama a onToggle', async () => {
    const onToggle = vi.fn()
    renderBrand({ onToggle })

    await userEvent.click(screen.getByRole('button', { name: 'Contraer menú lateral' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('al alternar con el teclado el foco pasa al botón nuevo', async () => {
    render(<StatefulBrand />)

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Contraer menú lateral' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Expandir menú lateral' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Contraer menú lateral' })).toHaveFocus()
  })
})
