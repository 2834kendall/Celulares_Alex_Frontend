import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutButton } from './LogoutButton'
import { logout } from '@/modules/auth/actions/logout'

vi.mock('@/modules/auth/actions/logout', () => ({
  logout: vi.fn(),
}))

const mockLogout = vi.mocked(logout)

describe('<LogoutButton />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza la etiqueta por defecto', () => {
    render(<LogoutButton />)
    expect(screen.getByRole('button', { name: /cerrar sesion/i })).toBeInTheDocument()
  })

  it('acepta etiqueta y clases personalizadas', () => {
    render(<LogoutButton label="Volver al inicio de sesion" className="custom" />)
    const button = screen.getByRole('button', { name: /volver al inicio de sesion/i })
    expect(button).toHaveClass('custom')
  })

  it('llama la server action de logout y queda deshabilitado mientras procesa', async () => {
    mockLogout.mockReturnValue(new Promise(() => {})) // pendiente: simula el redirect en curso
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    expect(mockLogout).toHaveBeenCalledOnce()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('restaura el boton si el logout falla, para poder reintentar', async () => {
    mockLogout.mockRejectedValue(new Error('network down'))
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
  })
})
