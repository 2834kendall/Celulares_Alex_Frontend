import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsSearch } from './SettingsSearch'
import { PERMISOS } from '@/lib/permissions/catalog'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const ADMIN = [PERMISOS.EMPRESAS_WRITE, PERMISOS.CATALOGOS_WRITE]

/** Igual que el AppShell: el estado de apertura vive afuera. */
function Harness({ permisos = ADMIN }: { permisos?: string[] }) {
  const [open, setOpen] = useState(false)
  return <SettingsSearch permisos={permisos} open={open} onOpenChange={setOpen} />
}

describe('<SettingsSearch />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cerrado no muestra nada; Ctrl+K lo abre con el campo enfocado', async () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.keyboard('{Control>}k{/Control}')

    expect(screen.getByRole('dialog', { name: 'Buscar ajuste' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('⌘+K también lo abre', async () => {
    render(<Harness />)

    await userEvent.keyboard('{Meta>}k{/Meta}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('escribir filtra y cada resultado muestra su ruta', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')

    await userEvent.type(screen.getByRole('combobox'), 'cargo')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Puestos')
    expect(options[0]).toHaveTextContent('Empleados / Puestos')
  })

  it('sin coincidencias lo dice', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')

    await userEvent.type(screen.getByRole('combobox'), 'zzz')

    expect(screen.getByText('No hay ajustes con ese nombre.')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('flechas mueven la selección y Enter navega y cierra', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.type(screen.getByRole('combobox'), 'reclutamiento')

    const [etapas, criterios] = screen.getAllByRole('option')
    expect(etapas).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect(criterios).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowDown}')
    expect(etapas).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowUp}')
    expect(criterios).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')

    expect(push).toHaveBeenCalledWith('/settings/recruitment/criteria')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('las flechas y Enter sin resultados no hacen nada', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')
    await userEvent.type(screen.getByRole('combobox'), 'zzz')

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clic en un resultado navega', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')

    await userEvent.click(screen.getByRole('option', { name: /apariencia/i }))

    expect(push).toHaveBeenCalledWith('/settings/appearance')
  })

  it('Escape y el clic afuera cierran', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Control>}k{/Control}')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.keyboard('{Control>}k{/Control}')
    // El fondo es el padre del diálogo.
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('solo busca entre los ajustes que el usuario ve', async () => {
    render(<Harness permisos={[PERMISOS.USUARIOS_WRITE]} />)
    await userEvent.keyboard('{Control>}k{/Control}')

    await userEvent.type(screen.getByRole('combobox'), 'etapas')

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})
