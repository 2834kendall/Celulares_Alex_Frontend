import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { requestPasswordReset } from '@/modules/auth/actions/requestPasswordReset'

vi.mock('@/modules/auth/actions/requestPasswordReset', () => ({
  requestPasswordReset: vi.fn(),
}))

const mockRequestPasswordReset = vi.mocked(requestPasswordReset)

async function submitEmail(email: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo electrónico'), email)
  await user.click(screen.getByRole('button', { name: /enviar enlace de recuperación/i }))
  return user
}

describe('<ForgotPasswordForm />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ofrece volver al login', () => {
    render(<ForgotPasswordForm />)

    expect(screen.getByRole('link', { name: /volver a iniciar sesión/i })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  it('valida el correo antes de llamar la action', async () => {
    render(<ForgotPasswordForm />)

    await submitEmail('no-es-correo')

    expect(await screen.findByText('Ingrese un correo electrónico válido.')).toBeVisible()
    expect(mockRequestPasswordReset).not.toHaveBeenCalled()
  })

  it('no llama la action con el campo vacío', async () => {
    render(<ForgotPasswordForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /enviar enlace de recuperación/i }))

    expect(await screen.findByText('El correo electrónico es requerido.')).toBeVisible()
    expect(mockRequestPasswordReset).not.toHaveBeenCalled()
  })

  it('envía el correo normalizado y muestra el acuse', async () => {
    mockRequestPasswordReset.mockResolvedValue({ ok: true })
    render(<ForgotPasswordForm />)

    await submitEmail('  ANA@EMPRESA.COM  ')

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({ email: 'ana@empresa.com' })
    })
    expect(await screen.findByText('Revise su correo')).toBeInTheDocument()
    // El formulario desaparece: no hay nada más que hacer en esta pantalla.
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
  })

  it('da el MISMO acuse para un correo que no existe (anti-enumeración)', async () => {
    // La action responde ok tanto para una cuenta real como para una inventada;
    // esta pantalla no puede reintroducir la diferencia que la action evita.
    // Se comparan los dos acuses en vez de un texto concreto: la propiedad que
    // importa es que sean indistinguibles, no cómo estén redactados.
    mockRequestPasswordReset.mockResolvedValue({ ok: true })

    const { unmount } = render(<ForgotPasswordForm />)
    await submitEmail('ana@empresa.com')
    const acuseCuentaReal = (await screen.findByText('Revise su correo')).parentElement?.textContent
    unmount()

    render(<ForgotPasswordForm />)
    await submitEmail('nadie@empresa.com')
    const acuseCuentaFalsa = (await screen.findByText('Revise su correo')).parentElement
      ?.textContent

    expect(acuseCuentaFalsa).toBe(acuseCuentaReal)
    expect(acuseCuentaFalsa).not.toContain('nadie@empresa.com')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra el error del servidor sin pasar al acuse', async () => {
    mockRequestPasswordReset.mockResolvedValue({
      ok: false,
      error: 'Demasiadas solicitudes. Espere unos minutos antes de volver a intentar.',
    })
    render(<ForgotPasswordForm />)

    await submitEmail('ana@empresa.com')

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiadas solicitudes.')
    expect(screen.queryByText('Revise su correo')).not.toBeInTheDocument()
  })

  it('muestra el error de conexión si la action lanza', async () => {
    mockRequestPasswordReset.mockRejectedValue(new Error('offline'))
    render(<ForgotPasswordForm />)

    await submitEmail('ana@empresa.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo conectar con el servicio de autenticacion/
    )
  })

  it('deshabilita el formulario mientras la action está pendiente', async () => {
    let resolveRequest!: (value: Awaited<ReturnType<typeof requestPasswordReset>>) => void
    mockRequestPasswordReset.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )
    render(<ForgotPasswordForm />)

    await submitEmail('ana@empresa.com')

    expect(await screen.findByText(/enviando enlace/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeDisabled()

    resolveRequest({ ok: true })
    expect(await screen.findByText('Revise su correo')).toBeInTheDocument()
  })
})
