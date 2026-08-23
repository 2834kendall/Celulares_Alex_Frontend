import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpiredLink } from './ExpiredLink'
import { expiredLinkContent } from '@/modules/auth/constants'

describe('<ExpiredLink />', () => {
  it('explica la invitación vencida y ofrece volver al login', () => {
    render(<ExpiredLink {...expiredLinkContent.invite} />)

    expect(screen.getByText('Enlace inválido o vencido')).toBeInTheDocument()
    expect(screen.getByText(/reenvíe la invitación/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir a iniciar sesión/i })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  it('en recuperación ofrece pedir otro enlace, no volver al login', () => {
    render(<ExpiredLink {...expiredLinkContent.recovery} />)

    expect(screen.getByText('Enlace inválido o vencido')).toBeInTheDocument()
    expect(screen.getByText(/ya venció o se usó antes/)).toBeInTheDocument()
    // La salida es la diferencia entre los dos flujos: la invitación la
    // reenvía un administrador, este enlace se lo puede pedir la persona sola.
    expect(screen.getByRole('link', { name: /solicitar un enlace nuevo/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })
})
