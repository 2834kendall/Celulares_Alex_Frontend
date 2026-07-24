import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivateAccountForm } from './ActivateAccountForm'
import { activateAccount } from '@/modules/auth/actions/activateAccount'

const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

vi.mock('@/modules/auth/actions/activateAccount', () => ({ activateAccount: vi.fn() }))

const mockActivateAccount = vi.mocked(activateAccount)

async function fillPasswords(password: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nueva contraseña'), password)
  await user.type(screen.getByLabelText('Confirmar contraseña'), confirm)
  await user.click(screen.getByRole('button', { name: /activar cuenta/i }))
  return user
}

describe('<ActivateAccountForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el email de la cuenta invitada', () => {
    render(<ActivateAccountForm email="ana@empresa.com" />)

    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument()
  })

  it('funciona sin email (solo omite la mención)', () => {
    render(<ActivateAccountForm email="" />)

    expect(screen.getByText(/define la contraseña/i)).toBeInTheDocument()
  })

  it('valida la coincidencia antes de llamar la action', async () => {
    render(<ActivateAccountForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'no-coincide')

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeVisible()
    expect(mockActivateAccount).not.toHaveBeenCalled()
  })

  it('valida la longitud mínima antes de llamar la action', async () => {
    render(<ActivateAccountForm email="ana@empresa.com" />)

    await fillPasswords('corta', 'corta')

    expect(await screen.findByText('La contraseña debe tener al menos 8 caracteres.')).toBeVisible()
    expect(mockActivateAccount).not.toHaveBeenCalled()
  })

  it('activa la cuenta y navega al destino', async () => {
    mockActivateAccount.mockResolvedValue({ ok: true, destination: '/dashboard' })
    render(<ActivateAccountForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    await waitFor(() => {
      expect(mockActivateAccount).toHaveBeenCalledWith({
        password: 'secreto123',
        confirmPassword: 'secreto123',
      })
    })
    expect(replace).toHaveBeenCalledWith('/dashboard')
    expect(refresh).toHaveBeenCalled()
  })

  it('muestra el error del servidor sin navegar', async () => {
    mockActivateAccount.mockResolvedValue({
      ok: false,
      error: 'La nueva contraseña debe ser distinta a la anterior.',
    })
    render(<ActivateAccountForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La nueva contraseña debe ser distinta a la anterior.'
    )
    expect(replace).not.toHaveBeenCalled()
  })

  it('muestra el error de conexión si la action lanza', async () => {
    mockActivateAccount.mockRejectedValue(new Error('offline'))
    render(<ActivateAccountForm email="ana@empresa.com" />)

    await fillPasswords('secreto123', 'secreto123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo conectar con el servicio de autenticacion/
    )
  })

  it('permite mostrar y ocultar la contraseña', async () => {
    render(<ActivateAccountForm email="ana@empresa.com" />)
    const user = userEvent.setup()

    const password = screen.getByLabelText('Nueva contraseña')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar contrasena' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ocultar contrasena' }))
    expect(password).toHaveAttribute('type', 'password')
  })
})
