import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './LoginForm'
import { login } from '@/modules/auth/actions/login'

const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

vi.mock('@/modules/auth/actions/login', () => ({
  login: vi.fn(),
}))

const mockLogin = vi.mocked(login)

async function fillAndSubmit(email = 'user@mail.com', password = 'secreto') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo Electronico'), email)
  await user.type(screen.getByLabelText('Contrasena'), password)
  await user.click(screen.getByRole('button', { name: /iniciar sesion/i }))
  return user
}

describe('<LoginForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza identidad del sistema y tarjetas de caracteristicas', () => {
    render(<LoginForm />)

    expect(screen.getByRole('heading', { level: 1, name: 'SGRH' })).toBeInTheDocument()
    expect(screen.getByText('Bienvenido de nuevo')).toBeInTheDocument()
    expect(screen.getByText('Expedientes')).toBeInTheDocument()
    expect(screen.getByText('Asistencia')).toBeInTheDocument()
    expect(screen.getByText('Planillas')).toBeInTheDocument()
  })

  it('ofrece la salida a recuperar la contrasena', () => {
    render(<LoginForm />)

    expect(screen.getByRole('link', { name: /olvidó su contraseña/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('muestra errores de validacion y no llama la action con campos vacios', async () => {
    render(<LoginForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /iniciar sesion/i }))

    expect(await screen.findByText('El correo electrónico es requerido.')).toBeInTheDocument()
    expect(screen.getByText('Ingrese su contraseña.')).toBeInTheDocument()
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('con credenciales validas navega al destino que indica la action', async () => {
    mockLogin.mockResolvedValue({ ok: true, destination: '/dashboard' })
    render(<LoginForm />)

    await fillAndSubmit('  USER@MAIL.COM ', 'secreto')

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ email: 'user@mail.com', password: 'secreto' })
      expect(replace).toHaveBeenCalledWith('/dashboard')
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('muestra el mensaje de error que devuelve la action', async () => {
    mockLogin.mockResolvedValue({ ok: false, error: 'Credenciales invalidas.' })
    render(<LoginForm />)

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales invalidas.')
    expect(replace).not.toHaveBeenCalled()
  })

  it('muestra error de conexion si la action lanza excepcion', async () => {
    mockLogin.mockRejectedValue(new Error('boom'))
    render(<LoginForm />)

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servicio de autenticacion'
    )
  })

  it('deshabilita el formulario mientras la action esta pendiente', async () => {
    let resolveLogin!: (value: Awaited<ReturnType<typeof login>>) => void
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve
      })
    )
    render(<LoginForm />)

    await fillAndSubmit()

    expect(await screen.findByText(/validando acceso/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Correo Electronico')).toBeDisabled()

    resolveLogin({ ok: true, destination: '/dashboard' })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('alterna la visibilidad de la contrasena', async () => {
    render(<LoginForm />)
    const user = userEvent.setup()
    const passwordInput = screen.getByLabelText('Contrasena')

    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar contrasena' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ocultar contrasena' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
