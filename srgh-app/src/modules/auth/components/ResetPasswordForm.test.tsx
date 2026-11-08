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

    await fillPasswords('Secreto1234!', 'no-coincide')

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeVisible()
    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('no llama la action con una contraseña que incumple la politica', async () => {
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('corta', 'corta')

    expect(mockResetPassword).not.toHaveBeenCalled()
  })

  it('marca cada requisito a medida que se cumple', async () => {
    // No alcanza con que el texto del requisito este en pantalla: la lista se
    // pinta siempre, asi que una asercion de presencia pasaria igual sin la
    // logica. Lo que se afirma es el ESTADO de cada item.
    const requisito = (etiqueta: string) => screen.getByText(etiqueta).closest('li')

    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('corta', 'corta')

    expect(requisito('Al menos 12 caracteres')).toHaveTextContent('(pendiente)')
    expect(requisito('Una letra minúscula')).toHaveTextContent('(cumplido)')
    expect(requisito('Una letra mayúscula')).toHaveTextContent('(pendiente)')
    expect(requisito('Un número')).toHaveTextContent('(pendiente)')
    expect(requisito('Un símbolo')).toHaveTextContent('(pendiente)')

    await fillPasswords('Secreto1234!', 'Secreto1234!')

    for (const etiqueta of [
      'Al menos 12 caracteres',
      'Una letra minúscula',
      'Una letra mayúscula',
      'Un número',
      'Un símbolo',
    ]) {
      expect(requisito(etiqueta)).toHaveTextContent('(cumplido)')
    }
  })

  describe('lista de requisitos plegable', () => {
    const lista = () => screen.getByText('Al menos 12 caracteres').closest('ul')
    const botonAyuda = () => screen.getByRole('button', { name: 'Ver requisitos de la contraseña' })

    it('arranca plegada y el signo de pregunta la abre y la cierra', async () => {
      render(<ResetPasswordForm email="ana@empresa.com" />)
      const user = userEvent.setup()

      expect(lista()).not.toBeVisible()
      expect(botonAyuda()).toHaveAttribute('aria-expanded', 'false')

      await user.click(botonAyuda())
      expect(lista()).toBeVisible()
      expect(botonAyuda()).toHaveAttribute('aria-expanded', 'true')

      await user.click(botonAyuda())
      expect(lista()).not.toBeVisible()
    })

    it('se abre sola mientras lo escrito no cumple, y se pliega al cumplir', async () => {
      render(<ResetPasswordForm email="ana@empresa.com" />)
      const user = userEvent.setup()
      const campo = screen.getByLabelText('Nueva contraseña')

      await user.type(campo, 'abc')
      expect(lista()).toBeVisible()

      await user.clear(campo)
      await user.type(campo, 'Secreto1234!')
      expect(lista()).not.toBeVisible()
    })

    it('se abre si el envio falla con el campo vacio, para que el rechazo no sea mudo', async () => {
      // Con el campo vacio no hay nada escrito que la abra, y el campo ya no
      // tiene mensaje de error propio: sin esta regla el unico aviso seria un
      // borde rojo.
      render(<ResetPasswordForm email="ana@empresa.com" />)
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: /guardar contraseña/i }))

      await waitFor(() => expect(lista()).toBeVisible())
      expect(mockResetPassword).not.toHaveBeenCalled()
    })
  })

  it('guarda la contraseña y navega al destino', async () => {
    mockResetPassword.mockResolvedValue({ ok: true, destination: '/dashboard' })
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('Secreto1234!', 'Secreto1234!')

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith({
        password: 'Secreto1234!',
        confirmPassword: 'Secreto1234!',
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

    await fillPasswords('Secreto1234!', 'Secreto1234!')

    expect(await screen.findByRole('alert')).toHaveTextContent(/El enlace de recuperación expiró/)
    expect(replace).not.toHaveBeenCalled()
  })

  it('muestra el error de conexión si la action lanza', async () => {
    mockResetPassword.mockRejectedValue(new Error('offline'))
    render(<ResetPasswordForm email="ana@empresa.com" />)

    await fillPasswords('Secreto1234!', 'Secreto1234!')

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

    await fillPasswords('Secreto1234!', 'Secreto1234!')

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
