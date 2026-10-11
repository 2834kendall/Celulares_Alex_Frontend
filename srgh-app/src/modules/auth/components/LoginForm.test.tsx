import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
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

/* jsdom no trae Web Animations: para ver la sacudida se instala uno falso. */
function installAnimate() {
  const animate = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

const submitButton = () => screen.getByRole('button', { name: /iniciar sesion/i })

describe('<LoginForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  })

  it.each([
    [8, 'Buenos días'],
    [15, 'Buenas tardes'],
    [20, 'Buenas noches'],
  ])('a las %i h saluda con "%s"', (hour, greeting) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, hour))

    render(<LoginForm />)

    expect(screen.getByText(greeting)).toBeInTheDocument()
  })

  it('el HTML del servidor saluda sin hora: la que vale es la del visitante', () => {
    const html = renderToString(<LoginForm />)

    expect(html).toContain('Hola')
    expect(html).not.toMatch(/Buen(os|as) /)
  })

  it('renderiza la identidad del sistema', () => {
    render(<LoginForm />)

    expect(screen.getByRole('heading', { level: 1, name: 'SGRH' })).toBeInTheDocument()
    expect(screen.getByText('Bienvenido de nuevo')).toBeInTheDocument()
  })

  it('las figuras no miran la contrasena oculta y se asoman cuando se muestra', async () => {
    const { container } = render(<LoginForm />)
    const user = userEvent.setup()
    const scene = container.querySelector('.login-scene')

    expect(scene).toHaveAttribute('data-mood', 'idle')

    await user.click(screen.getByLabelText('Contrasena'))
    expect(scene).toHaveAttribute('data-mood', 'hiding')

    await user.click(screen.getByRole('button', { name: 'Mostrar contrasena' }))
    expect(scene).toHaveAttribute('data-mood', 'peeking')

    await user.click(screen.getByRole('button', { name: 'Ocultar contrasena' }))
    expect(scene).toHaveAttribute('data-mood', 'idle')
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
      // Un solo render del destino: las cookies nuevas ya invalidan la caché.
      expect(refresh).not.toHaveBeenCalled()
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

  it('un intento fallido sacude la tarjeta y las figuras se reponen al rato', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const animate = installAnimate()
    const { container } = render(<LoginForm />)
    const scene = container.querySelector('.login-scene')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.click(submitButton())

    await waitFor(() => expect(scene).toHaveAttribute('data-mood', 'error'))
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.contexts[0]).toHaveClass('login-card')

    // Vuelven a reaccionar al campo enfocado: el formulario lleva el foco
    // al primer campo invalido, el correo.
    act(() => vi.advanceTimersByTime(1600))
    expect(scene).toHaveAttribute('data-mood', 'watching')
  })

  it('con movimiento reducido no sacude la tarjeta', async () => {
    const animate = installAnimate()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
    const { container } = render(<LoginForm />)

    await userEvent.setup().click(submitButton())

    await waitFor(() =>
      expect(container.querySelector('.login-scene')).toHaveAttribute('data-mood', 'error')
    )
    expect(animate).not.toHaveBeenCalled()
  })

  it('avisa del Bloq Mayús solo mientras se escribe la contraseña', async () => {
    render(<LoginForm />)
    const user = userEvent.setup()
    const password = screen.getByLabelText('Contrasena')
    const warning = () => screen.queryByText(/bloq mayús activado/i)

    await user.click(password)
    await user.keyboard('{CapsLock}')
    expect(warning()).toBeInTheDocument()

    // Fuera del campo no se muestra, aunque siga activado.
    await user.click(screen.getByLabelText('Correo Electronico'))
    expect(warning()).not.toBeInTheDocument()
    await user.click(password)
    expect(warning()).toBeInTheDocument()

    // Se lee en cada tecla que se suelta: al apagarlo, la siguiente lo quita.
    await user.keyboard('{CapsLock}a')
    expect(warning()).not.toBeInTheDocument()
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
