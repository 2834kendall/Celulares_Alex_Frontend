import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpiredInvitation } from './ExpiredInvitation'

describe('<ExpiredInvitation />', () => {
  it('explica el enlace vencido y ofrece volver al login', () => {
    render(<ExpiredInvitation />)

    expect(screen.getByText('Enlace inválido o vencido')).toBeInTheDocument()
    expect(screen.getByText(/reenvíe la invitación/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir a iniciar sesión/i })).toHaveAttribute(
      'href',
      '/login'
    )
  })
})
