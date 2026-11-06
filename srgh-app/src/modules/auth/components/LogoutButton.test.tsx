import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutButton } from './LogoutButton'
import { logout } from '@/modules/auth/actions/logout'
import { toast } from 'sonner'

vi.mock('@/modules/auth/actions/logout', () => ({
  logout: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
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
    mockLogout.mockReturnValue(new Promise(() => {})) // pendiente: la accion todavia no volvio
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    expect(mockLogout).toHaveBeenCalledOnce()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('al salir bien navega al login con replace y no avisa nada', async () => {
    // Este es el caso del bug: antes la accion redirigia desde el servidor,
    // Next le rechazaba la promesa al cliente y el boton mostraba "no se pudo
    // cerrar la sesion" mientras navegaba. El test viejo simulaba que el
    // redirect devolvia undefined, que NO es lo que hace Next, y por eso no lo
    // atrapo. Ahora la accion devuelve { ok: true } y navega el boton.
    mockLogout.mockResolvedValue({ ok: true })
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    expect(toast.error).not.toHaveBeenCalled()
    // Sigue deshabilitado: la navegacion lo desmonta, y mientras tanto no se
    // puede disparar dos veces.
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('muestra el error del servidor cuando signOut falla, no navega y deja reintentar', async () => {
    mockLogout.mockResolvedValue({ ok: false, error: 'El servidor no pudo cerrar la sesión.' })
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    expect(toast.error).toHaveBeenCalledWith('El servidor no pudo cerrar la sesión.')
    expect(replace).not.toHaveBeenCalled()
  })

  it('ante una caida de red avisa con su propio mensaje, no navega y deja reintentar', async () => {
    mockLogout.mockRejectedValue(new Error('network down'))
    render(<LogoutButton />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /cerrar sesion/i }))

    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    expect(toast.error).toHaveBeenCalledWith(
      'No se pudo conectar para cerrar la sesión. Revise su conexión e intente de nuevo.'
    )
    expect(replace).not.toHaveBeenCalled()
  })
})
