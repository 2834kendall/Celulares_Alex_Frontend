import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordForm } from './ResetPasswordForm'
import { resetPassword } from '@/modules/auth/actions/resetPassword'

const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

vi.mock('@/modules/auth/actions/resetPassword', () => ({ resetPassword: vi.fn() }))

const mockResetPassword = vi.mocked(resetPassword)

async function fillPasswords(password: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nueva contraseña'), password)
  await user.type(screen.getByLabelText('Confirmar contraseña'), confirm)
  await user.click(screen.getByRole('button', { name: /guardar contraseña/i }))
  return user
}

describe('<ResetPasswordForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el email de la cuenta que se está recuperando', () => {
    render(<ResetPasswordForm email="ana@empresa.com" />)

    expect(screen.getByText('Restablecer contraseña')).toBeInTheDocument()
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument()
  })

  it('funciona sin email (solo omite la mención)', () => {
    render(<ResetPasswordForm email="" />)

    expect(screen.getByText(/elija la contraseña nueva/i)).toBeInTheDocument()
  })

  it('valida la coincidencia antes de llamar la action', async () => {
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'no-coincide')

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeVisible()
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('valida la longitud mínima antes de llamar la action', async () => {
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('corta', 'corta')

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible()
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('guarda la contraseña y navega al destino', async () => {
    mockResetPassword.mockResolvedValue({ ok: true, destination: '/dashboard' })
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        password: 'secreto123',
        confirmPassword: 'secreto123',
      })
    })
    expect(replace).toHaveBeenCalledWith('/dashboard')
    expect(refresh).toHaveBeenCalled()
  })

  it('muestra el error del servidor sin navegar', async () => {
    mockResetPassword.mockResolvedValue({
      ok: false,
      error: 'El enlace de recuperación expiró. Solicite uno nuevo desde la pantalla de acceso.',
    })
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    expect(await screen.findByRole('alert')).toHaveTextContent(/El enlace de recuperación expiró/)
    expect(replace).not.toHaveBeenCalled()
  })

  it('muestra el error de conexión si la action lanza', async () => {
    mockResetPassword.mockRejectedValue(new Error('offline'))
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo conectar con el servicio de autenticacion/
    )
  })

  it('deshabilita el formulario mientras la action está pendiente', async () => {
    let resolveReset!: (value: Awaited<ReturnType<typeof resetPassword>>) => void
    mockResetPassword.mockReturnValue(
      new Promise((resolve) => {
        resolveReset = resolve
      })
    )
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    expect(await screen.findByText(/guardando contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeDisabled()

    resolveReset({ ok: true, destination: '/dashboard' })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('permite mostrar y ocultar la contraseña', async () => {
    render(<ResetPasswordForm email="ana@empresa.com" />)
    const user = userEvent.setup()
    const password = screen.getByLabelText('Nueva contraseña')

    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar contrasena' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ocultar contrasena' }))
    expect(password).toHaveAttribute('type', 'password')
  })
})
