import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScheduleTabs } from './ScheduleTabs'

const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/schedule',
  useSearchParams: () => new URLSearchParams(searchString),
}))

function renderTabs() {
  return render(
    <ScheduleTabs
      plantillaContent={<div>Contenido plantilla</div>}
      especialesContent={<div>Contenido especiales</div>}
      jornadasContent={<div>Contenido jornadas</div>}
    />
  )
}

describe('<ScheduleTabs />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('sin parametro "tab" muestra plantilla como pestana activa por defecto', () => {
    renderTabs()

    expect(screen.getByText('Contenido plantilla')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Horarios especiales/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('muestra el contenido de especiales cuando ?tab=especiales', () => {
    searchString = 'tab=especiales'
    renderTabs()

    expect(screen.getByText('Contenido especiales')).toBeInTheDocument()
    expect(screen.queryByText('Contenido plantilla')).not.toBeInTheDocument()
  })

  it('cae de vuelta a plantilla si el tab de la url es invalido', () => {
    searchString = 'tab=inexistente'
    renderTabs()

    expect(screen.getByText('Contenido plantilla')).toBeInTheDocument()
  })

  it('al hacer click en una pestana navega agregando el query param', async () => {
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Plantilla base corporativa/ }))

    expect(push).toHaveBeenCalledWith('/schedule?tab=especiales')
  })

  it('al volver a la pestana plantilla quita el query param', async () => {
    searchString = 'tab=especiales'
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Horarios especiales/ }))

    expect(push).toHaveBeenCalledWith('/schedule')
  })
})
