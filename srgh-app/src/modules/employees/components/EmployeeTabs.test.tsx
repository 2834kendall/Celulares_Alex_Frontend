import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeTabs } from './EmployeeTabs'

const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/employees',
  useSearchParams: () => new URLSearchParams(searchString),
}))

function renderTabs(usuariosContent: React.ReactNode | null = <div>Contenido usuarios</div>) {
  return render(
    <EmployeeTabs
      empleadosContent={<div>Contenido empleados</div>}
      usuariosContent={usuariosContent}
    />
  )
}

describe('<EmployeeTabs />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('sin parámetro "tab" muestra empleados como pestaña activa por defecto', () => {
    renderTabs()

    expect(screen.getByText('Contenido empleados')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Empleados/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('muestra el contenido de usuarios cuando ?tab=usuarios', () => {
    searchString = 'tab=usuarios'
    renderTabs()

    expect(screen.getByText('Contenido usuarios')).toBeInTheDocument()
    expect(screen.queryByText('Contenido empleados')).not.toBeInTheDocument()
  })

  it('cae de vuelta a empleados si el tab de la url es inválido', () => {
    searchString = 'tab=inexistente'
    renderTabs()

    expect(screen.getByText('Contenido empleados')).toBeInTheDocument()
  })

  it('al hacer click en una pestaña navega agregando el query param', async () => {
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Usuarios/ }))

    expect(push).toHaveBeenCalledWith('/employees?tab=usuarios')
  })

  it('al volver a la pestaña empleados quita el query param', async () => {
    searchString = 'tab=usuarios'
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Empleados/ }))

    expect(push).toHaveBeenCalledWith('/employees')
  })

  it('sin permiso de usuarios (contenido null) no renderiza tabs', () => {
    renderTabs(null)

    expect(screen.getByText('Contenido empleados')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
