import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessDenied } from './AccessDenied'
import { logout } from '@/modules/auth/actions/logout'

vi.mock('@/modules/auth/actions/logout', () => ({
  logout: vi.fn(),
}))

const mockLogout = vi.mocked(logout)

describe('<AccessDenied />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('es la pantalla estilo login, con el guardia de las escenas de estado', () => {
    const { container } = render(<AccessDenied exit="home" />)

    expect(container.querySelector('.login-screen')).not.toBeNull()
    expect(container.querySelector('.state-scene')).toHaveAttribute('data-mood', 'stern')
    expect(screen.getByRole('heading', { level: 2, name: 'Acceso no autorizado' })).toBeVisible()
  })

  it('con permisos vuelve al inicio, y cerrar sesión queda de segunda opción', async () => {
    render(<AccessDenied exit="home" />)

    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute(
      'href',
      '/dashboard'
    )
    expect(screen.getByText(/no tiene permiso para ver esta sección/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('sin ningún permiso solo ofrece volver al inicio de sesión', async () => {
    render(<AccessDenied exit="logout" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/todavía no tiene permisos asignados/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /volver al inicio de sesión/i }))
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('sin sesión lleva al login', () => {
    render(<AccessDenied exit="login" />)

    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/su sesión no está activa/i)).toBeInTheDocument()
  })
})
